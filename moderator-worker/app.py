#!/usr/bin/env python3
"""
Photo Moderation Worker
Processes photo moderation jobs from Redis queue
"""

import os
import json
import time
import logging
import redis
import requests
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
from transformers import AutoImageProcessor, AutoModelForImageClassification
import torch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration from environment
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')
REDIS_DB = int(os.getenv('REDIS_DB', 0))
COMPREFACE_URL = os.getenv('COMPREFACE_URL', 'http://compreface:8000')
S3_ENDPOINT = os.getenv('S3_ENDPOINT', '')
S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY', '')
S3_SECRET_KEY = os.getenv('S3_SECRET_KEY', '')
S3_BUCKET_PHOTOS = os.getenv('S3_BUCKET_PHOTOS', 'lomi-photos')

# Queue and channel names
QUEUE_NAME = 'photo_moderation_queue'
RESULTS_CHANNEL = 'moderation_results'

# Moderation thresholds (STRICT for safety)
BLUR_THRESHOLD = 120  # Laplacian variance
NSFW_PORN_THRESHOLD = 0.25  # Very strict - reject if porn > 25%
NSFW_SEXY_THRESHOLD = 0.40  # Strict - reject if sexy > 40%
NSFW_HENTAI_THRESHOLD = 0.30  # Strict - reject if hentai > 30%
NSFW_ANY_THRESHOLD = 0.20  # Reject if ANY NSFW category > 20% (safety net)

# Initialize Redis
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD if REDIS_PASSWORD else None,
    db=REDIS_DB,
    decode_responses=False  # Keep binary for JSON
)

# Initialize NSFW model (Falconsai/nsfw_image_detection - proven working model)
logger.info("Loading NSFW detection model...")
try:
    from transformers import AutoImageProcessor, AutoModelForImageClassification
    
    model_name = "Falconsai/nsfw_image_detection"
    nsfw_processor = AutoImageProcessor.from_pretrained(model_name)
    
    # Use float32 for CPU (float16 not supported on CPU)
    # Check if CUDA is available for GPU
    if torch.cuda.is_available():
        logger.info("Using GPU with float16 for NSFW model")
        nsfw_model = AutoModelForImageClassification.from_pretrained(
            model_name,
            torch_dtype=torch.float16,
            device_map="auto"
        )
    else:
        logger.info("Using CPU with float32 for NSFW model (CPU doesn't support float16)")
        nsfw_model = AutoModelForImageClassification.from_pretrained(
            model_name,
            torch_dtype=torch.float32,
            device_map="cpu"
        )
    
    nsfw_model.eval()  # Set to evaluation mode
    logger.info("✅ NSFW model loaded successfully")
except Exception as e:
    logger.error(f"❌ Failed to load NSFW model: {e}")
    logger.warning("⚠️ Continuing without NSFW detection - photos will be approved by default")
    nsfw_model = None
    nsfw_processor = None


def download_image_from_r2(r2_url: str) -> bytes:
    """Download image from R2/S3"""
    try:
        response = requests.get(r2_url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"Failed to download image from R2: {e}")
        raise


def check_face_opencv(image_bytes: bytes) -> dict:
    """
    Fallback face detection using OpenCV Haar Cascade with age estimation.
    
    NOTE: This is a fallback when CompreFace is unavailable.
    For accurate age estimation, CompreFace should be running.
    This method uses face size heuristics which are less accurate but better than nothing.
    
    Age estimation logic:
    - Very small faces (< 3% image area) = babies (age ~5)
    - Small faces (3-5% image area) = children (age ~10)
    - Medium-small faces (5-7% image area) = teens (age ~15)
    - Medium faces (7-10% image area) = young adults (age ~20)
    - Large faces (> 10% image area) = adults (age ~25)
    """
    try:
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            logger.warning("OpenCV: Failed to decode image")
            return {"has_face": False, "face_count": 0}
        
        height, width = img.shape[:2]
        # More reasonable face size limits - allow smaller faces but validate them
        min_face_size = max(30, int(min(width, height) * 0.05))  # At least 5% of smaller dimension (allows smaller faces)
        max_face_size = int(min(width, height) * 0.9)  # Max 90% of smaller dimension
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Load face cascade (OpenCV includes this)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        
        # Balanced parameters - not too strict, not too lenient
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.2,  # Balanced sensitivity
            minNeighbors=4,   # Reasonable strictness (was 6, too strict)
            minSize=(min_face_size, min_face_size),
            maxSize=(max_face_size, max_face_size),
            flags=cv2.CASCADE_SCALE_IMAGE
        )
        
        # Additional validation: check if detected faces are reasonable
        valid_faces = []
        face_sizes = []  # Track face sizes for age estimation
        
        for (x, y, w, h) in faces:
            # Face should be reasonably sized relative to image
            face_area = w * h
            image_area = width * height
            face_ratio = face_area / image_area
            
            # Face should be between 1% and 60% of image area (more lenient)
            if 0.01 <= face_ratio <= 0.6:
                # Face should be roughly square (width/height ratio between 0.6 and 1.5)
                aspect_ratio = w / h if h > 0 else 0
                if 0.6 <= aspect_ratio <= 1.5:
                    valid_faces.append((x, y, w, h))
                    face_sizes.append((w, h, face_ratio))
                    logger.debug(f"OpenCV: Valid face detected - size: {w}x{h}, ratio: {face_ratio:.3f}, aspect: {aspect_ratio:.2f}")
                else:
                    logger.debug(f"OpenCV: Rejected face with bad aspect ratio {aspect_ratio:.2f}")
            else:
                logger.debug(f"OpenCV: Rejected face with bad size ratio {face_ratio:.3f}")
        
        face_count = len(valid_faces)
        
        # Estimate age from face size and facial features (improved heuristic)
        # Average adult face is typically 8-15% of image area in a portrait
        # Baby faces are typically 2-5% of image area
        # Children (5-12 years): 5-8% of image area
        # Teens (13-17 years): 6-10% of image area
        estimated_age = None
        if face_count > 0 and len(face_sizes) > 0:
            # Get the largest face (most likely the main subject)
            largest_face = max(face_sizes, key=lambda s: s[0] * s[1])  # Sort by area (w * h)
            face_w, face_h, face_ratio = largest_face
            
            # Calculate face dimensions relative to image
            face_width_ratio = face_w / width
            face_height_ratio = face_h / height
            
            # Additional heuristic: check face position (babies often centered, adults vary)
            # But this is less reliable, so we'll focus on size
            
            # STRICT age estimation focused on detecting children UNDER 10 years old
            # Very small faces (< 2.5% of image) = babies/toddlers (0-3 years) - DEFINITELY UNDER 10
            if face_ratio < 0.025:
                estimated_age = 3  # Very conservative - definitely under 10
                logger.info(f"OpenCV: Very small face detected (ratio={face_ratio:.3f}, {face_w}x{face_h}px) - estimated age ~3 (BABY - UNDER 10)")
            
            # Small faces (2.5-4% of image) = toddlers/young children (4-7 years) - UNDER 10
            elif face_ratio < 0.04:
                estimated_age = 6  # Conservative - likely under 10
                logger.info(f"OpenCV: Small face detected (ratio={face_ratio:.3f}, {face_w}x{face_h}px) - estimated age ~6 (CHILD - UNDER 10)")
            
            # Medium-small faces (4-6% of image) = children (8-12 years) - BORDERLINE, be conservative
            elif face_ratio < 0.06:
                estimated_age = 9  # Conservative - could be under 10, reject to be safe
                logger.info(f"OpenCV: Medium-small face detected (ratio={face_ratio:.3f}, {face_w}x{face_h}px) - estimated age ~9 (CHILD - UNDER 10)")
            
            # Medium faces (6-9% of image) = older children/teens (13-17 years) - LIKELY OVER 10
            elif face_ratio < 0.09:
                estimated_age = 15  # Likely over 10, but still under 18
                logger.info(f"OpenCV: Medium face detected (ratio={face_ratio:.3f}, {face_w}x{face_h}px) - estimated age ~15 (TEEN - OVER 10)")
            
            # Large faces (> 9% of image) = adults (18+ years) - DEFINITELY OVER 10
            else:
                estimated_age = 25  # Likely adult, definitely over 10
                logger.info(f"OpenCV: Large face detected (ratio={face_ratio:.3f}, {face_w}x{face_h}px) - estimated age ~25 (ADULT - OVER 10)")
            
            # Additional check: if face is very small in absolute pixels, likely a baby/young child
            # Typical baby face in a photo: 40-80 pixels wide
            # Typical child face (5-9 years): 80-120 pixels wide
            # Typical adult face in a photo: 150-300 pixels wide
            if face_w < 100 or face_h < 100:
                if estimated_age is None or estimated_age >= 10:
                    estimated_age = 7  # Very small absolute size = likely under 10
                    logger.info(f"OpenCV: Very small absolute face size ({face_w}x{face_h}px) - adjusting age estimate to ~7 (UNDER 10)")
        
        logger.info(f"OpenCV face detection: found {len(faces)} candidate(s), {face_count} valid face(s) (image: {width}x{height}, estimated_age={estimated_age})")
        
        return {
            "has_face": face_count > 0,
            "face_count": face_count,
            "estimated_age": estimated_age  # Return estimated age if available
        }
    except Exception as e:
        logger.error(f"OpenCV face detection failed: {e}")
        return {"has_face": False, "face_count": 0, "estimated_age": None}


def check_blur(image_bytes: bytes) -> dict:
    """Check if image is blurry using OpenCV Laplacian variance"""
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"blur_variance": 0, "is_blurry": True}
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        is_blurry = laplacian_var < BLUR_THRESHOLD
        return {
            "blur_variance": float(laplacian_var),
            "is_blurry": is_blurry
        }
    except Exception as e:
        logger.error(f"Blur check failed: {e}")
        return {"blur_variance": 0, "is_blurry": True}


def check_face_and_age(image_bytes: bytes) -> dict:
    """Check for faces and estimate age using CompreFace"""
    try:
        # CompreFace detection endpoint - try different possible formats
        # CompreFace typically uses: /api/v1/detection/detect with API key
        # But for basic setup, might use: /api/v1/recognition/recognize or /api/v1/detection/detect
        
        files = {'file': ('image.jpg', image_bytes, 'image/jpeg')}
        
        # Try detection endpoint first (most common)
        endpoints_to_try = [
            f"{COMPREFACE_URL}/api/v1/detection/detect",
            f"{COMPREFACE_URL}/api/v1/recognition/recognize",
            f"{COMPREFACE_URL}/api/v1/detection",
        ]
        
        response = None
        result = None
        
        for endpoint in endpoints_to_try:
            try:
                logger.debug(f"Trying CompreFace endpoint: {endpoint}")
                response = requests.post(
                    endpoint,
                    files=files,
                    timeout=15,
                    headers={'Content-Type': 'multipart/form-data'}
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.debug(f"CompreFace response: {result}")
                    break
                elif response.status_code == 404:
                    logger.warning(f"Endpoint {endpoint} not found (404), trying next...")
                    continue
                else:
                    logger.warning(f"Endpoint {endpoint} returned {response.status_code}: {response.text[:200]}")
                    response.raise_for_status()
            except requests.exceptions.RequestException as e:
                logger.warning(f"Request to {endpoint} failed: {e}")
                continue
        
        if result is None:
            raise Exception("All CompreFace endpoints failed")
        
        # Parse CompreFace response - structure can vary
        # Common formats:
        # 1. {"result": [{"box": {...}, "age": 25, ...}]}
        # 2. {"faces": [{"box": {...}, "age": 25, ...}]}
        # 3. {"data": {"result": [...]}}
        
        faces = []
        if isinstance(result, dict):
            # Try different response structures
            if 'result' in result:
                faces = result['result']
                if isinstance(faces, dict) and 'faces' in faces:
                    faces = faces['faces']
            elif 'faces' in result:
                faces = result['faces']
            elif 'data' in result and isinstance(result['data'], dict):
                if 'result' in result['data']:
                    faces = result['data']['result']
                elif 'faces' in result['data']:
                    faces = result['data']['faces']
        
        if not isinstance(faces, list):
            faces = []
        
        face_count = len(faces)
        has_face = face_count > 0
        
        # Estimate age from first face (if available)
        estimated_age = None
        if faces and len(faces) > 0:
            first_face = faces[0]
            # Age might be in different fields
            estimated_age = first_face.get('age') or first_face.get('age_years') or first_face.get('estimated_age')
            if estimated_age is not None:
                try:
                    estimated_age = float(estimated_age)
                except (ValueError, TypeError):
                    estimated_age = None
        
        logger.info(f"Face detection result: has_face={has_face}, face_count={face_count}, estimated_age={estimated_age}")
        
        return {
            "has_face": has_face,
            "face_count": face_count,
            "estimated_age": estimated_age,
            "raw_response": result  # Include for debugging
        }
    except requests.exceptions.ConnectionError as e:
        logger.error(f"CompreFace connection failed - is it running at {COMPREFACE_URL}? Error: {e}")
        return {
            "has_face": False,
            "face_count": 0,
            "estimated_age": None,
            "error": "connection_failed"
        }
    except requests.exceptions.Timeout as e:
        logger.error(f"CompreFace request timeout: {e}")
        return {
            "has_face": False,
            "face_count": 0,
            "estimated_age": None,
            "error": "timeout"
        }
    except Exception as e:
        logger.error(f"Face detection failed: {e}", exc_info=True)
        logger.error(f"Response status: {response.status_code if response else 'No response'}")
        logger.error(f"Response text: {response.text[:500] if response else 'No response'}")
        return {
            "has_face": False,
            "face_count": 0,
            "estimated_age": None,
            "error": str(e)
        }


def check_nsfw(image_bytes: bytes) -> dict:
    """Check for NSFW content using Falconsai NSFW detection model"""
    global nsfw_model  # Declare as global to allow modification
    
    if nsfw_model is None or nsfw_processor is None:
        logger.warning("NSFW model not loaded, skipping NSFW check")
        return {
            "porn": 0.0,
            "sexy": 0.0,
            "hentai": 0.0
        }
    
    try:
        # Ensure model is on correct device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model_device = next(nsfw_model.parameters()).device
        model_dtype = next(nsfw_model.parameters()).dtype
        
        # Move model to device if needed
        if model_device.type != device:
            nsfw_model = nsfw_model.to(device)
        
        # Convert to float32 if on CPU and model is float16 (shouldn't happen, but safety check)
        if device == "cpu" and model_dtype == torch.float16:
            logger.warning("Converting NSFW model to float32 for CPU compatibility")
            nsfw_model = nsfw_model.float()
            model_dtype = torch.float32
        
        # Load image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        
        # Process image
        inputs = nsfw_processor(images=image, return_tensors="pt")
        
        # Move inputs to same device and dtype as model
        current_device = next(nsfw_model.parameters()).device
        current_dtype = next(nsfw_model.parameters()).dtype
        inputs = {k: v.to(current_device).to(current_dtype) if v.dtype.is_floating_point else v.to(current_device) 
                 for k, v in inputs.items()}
        
        # Run inference
        with torch.no_grad():
            outputs = nsfw_model(**inputs)
            logits = outputs.logits
            probs = torch.nn.functional.softmax(logits, dim=-1)
        
        # Get probabilities - Falconsai model outputs: [drawings, hentai, neutral, porn, sexy]
        probs_list = probs[0].cpu().numpy().tolist()
        
        # Log raw probabilities for debugging
        logger.debug(f"NSFW model raw output: {probs_list} (length={len(probs_list)})")
        
        # Falconsai model class indices (check model config for exact order):
        # Typically: 0=drawings, 1=hentai, 2=neutral, 3=porn, 4=sexy
        if len(probs_list) >= 5:
            # Format: [drawings, hentai, neutral, porn, sexy]
            porn_score = float(probs_list[3]) if len(probs_list) > 3 else 0.0
            sexy_score = float(probs_list[4]) if len(probs_list) > 4 else 0.0
            hentai_score = float(probs_list[1]) if len(probs_list) > 1 else 0.0
            drawings_score = float(probs_list[0]) if len(probs_list) > 0 else 0.0
            neutral_score = float(probs_list[2]) if len(probs_list) > 2 else 0.0
            
            logger.info(f"🔍 NSFW scores: porn={porn_score:.3f}, sexy={sexy_score:.3f}, hentai={hentai_score:.3f}, "
                       f"neutral={neutral_score:.3f}, drawings={drawings_score:.3f}")
        elif len(probs_list) == 2:
            # Binary classification: [normal, nsfw]
            nsfw_score = float(probs_list[1])
            porn_score = nsfw_score * 0.5
            sexy_score = nsfw_score * 0.3
            hentai_score = nsfw_score * 0.2
            logger.info(f"🔍 NSFW binary output: nsfw={nsfw_score:.3f} -> porn={porn_score:.3f}, sexy={sexy_score:.3f}, hentai={hentai_score:.3f}")
        else:
            # Fallback - log for debugging
            logger.warning(f"⚠️ Unexpected model output shape: {len(probs_list)} classes - raw: {probs_list}")
            porn_score = 0.0
            sexy_score = 0.0
            hentai_score = 0.0
        
        # Verify scores are reasonable (not all zeros)
        if porn_score == 0.0 and sexy_score == 0.0 and hentai_score == 0.0:
            logger.warning(f"⚠️ All NSFW scores are zero - model might not be working correctly")
        
        return {
            "porn": porn_score,
            "sexy": sexy_score,
            "hentai": hentai_score
        }
    except Exception as e:
        logger.error(f"NSFW check failed: {e}")
        return {
            "porn": 0.0,
            "sexy": 0.0,
            "hentai": 0.0
        }


def moderate_photo(photo_job: dict) -> dict:
    """Moderate a single photo"""
    start_time = time.time()
    
    try:
        # Download image
        image_bytes = download_image_from_r2(photo_job['r2_url'])
        
        # Run checks in parallel (simplified - run sequentially for now)
        blur_result = check_blur(image_bytes)
        face_result = check_face_and_age(image_bytes)
        nsfw_result = check_nsfw(image_bytes)
        
        # Aggregate scores
        scores = {
            "blur_variance": blur_result["blur_variance"],
            "has_face": face_result["has_face"],
            "face_count": face_result["face_count"],
            "estimated_age": face_result["estimated_age"],
            "nsfw_scores": nsfw_result,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
        
        # Determine status
        status = "approved"
        reason = None
        
        # Log all results for debugging
        logger.info(f"📊 Moderation results for {photo_job.get('media_id')}: "
                   f"blur={blur_result.get('is_blurry')} (var={blur_result.get('blur_variance', 0):.1f}), "
                   f"has_face={face_result.get('has_face')}, "
                   f"face_count={face_result.get('face_count')}, "
                   f"age={face_result.get('estimated_age')}, "
                   f"nsfw_porn={nsfw_result.get('porn'):.3f}, "
                   f"nsfw_sexy={nsfw_result.get('sexy'):.3f}, "
                   f"nsfw_hentai={nsfw_result.get('hentai', 0):.3f}")
        
        # Check blur
        if blur_result["is_blurry"]:
            status = "rejected"
            reason = "blurry"
            logger.info(f"❌ Rejected: blurry (variance={blur_result.get('blur_variance', 0):.1f})")
        
        # Check face - but only if CompreFace is working (not connection error)
        elif "error" in face_result:
            # CompreFace failed - use OpenCV as fallback for basic face detection
            logger.warning(f"⚠️ CompreFace error: {face_result.get('error')} - trying OpenCV fallback")
            logger.info(f"🔄 Running OpenCV face detection fallback...")
            opencv_face_result = check_face_opencv(image_bytes)
            logger.info(f"🔄 OpenCV result: has_face={opencv_face_result.get('has_face')}, face_count={opencv_face_result.get('face_count')}, age={opencv_face_result.get('estimated_age')}")
            if opencv_face_result["has_face"]:
                logger.info(f"✅ OpenCV fallback detected {opencv_face_result['face_count']} valid face(s)")
                # Use OpenCV result (includes age estimation if available)
                face_result = opencv_face_result
            else:
                logger.warning(f"❌ Both CompreFace and OpenCV failed - rejecting (no face detected)")
                status = "rejected"
                reason = "no_face"
        elif not face_result["has_face"]:
            status = "rejected"
            reason = "no_face"
            logger.info(f"❌ Rejected: no face detected (face_count={face_result.get('face_count', 0)})")
        
        # Check for group photos (more than 1 face) - REJECT
        elif face_result.get("face_count", 0) > 1:
            status = "rejected"
            reason = "group_photo"
            logger.info(f"❌ Rejected: group photo detected ({face_result.get('face_count', 0)} faces - only single person photos allowed)")
        
        # Check age (including OpenCV age estimation) - STRICT: reject if age < 10
        elif face_result.get("estimated_age") is not None:
            estimated_age = face_result.get("estimated_age")
            if estimated_age < 10:
                status = "rejected"
                reason = "underage"
                logger.info(f"❌ Rejected: underage (estimated_age={estimated_age} < 10 years old)")
            else:
                logger.info(f"✅ Age check passed: estimated_age={estimated_age} >= 10 years old")
        
        # Check NSFW - STRICT MULTI-LEVEL CHECKING
        porn_score = nsfw_result.get("porn", 0)
        sexy_score = nsfw_result.get("sexy", 0)
        hentai_score = nsfw_result.get("hentai", 0)
        
        # Level 1: Safety net - reject if ANY NSFW category > 20%
        if porn_score > NSFW_ANY_THRESHOLD or sexy_score > NSFW_ANY_THRESHOLD or hentai_score > NSFW_ANY_THRESHOLD:
            # Level 2: Check specific thresholds
            if porn_score > NSFW_PORN_THRESHOLD:
                status = "rejected"
                reason = "nsfw"
                logger.info(f"❌ Rejected: NSFW PORN (score={porn_score:.3f} > threshold={NSFW_PORN_THRESHOLD})")
            elif sexy_score > NSFW_SEXY_THRESHOLD:
                status = "rejected"
                reason = "nsfw"
                logger.info(f"❌ Rejected: NSFW SEXY (score={sexy_score:.3f} > threshold={NSFW_SEXY_THRESHOLD})")
            elif hentai_score > NSFW_HENTAI_THRESHOLD:
                status = "rejected"
                reason = "nsfw"
                logger.info(f"❌ Rejected: NSFW HENTAI (score={hentai_score:.3f} > threshold={NSFW_HENTAI_THRESHOLD})")
            else:
                # Safety net: if any score > 20% but below specific thresholds, still reject for safety
                status = "rejected"
                reason = "nsfw"
                logger.info(f"❌ Rejected: NSFW SAFETY NET (porn={porn_score:.3f}, sexy={sexy_score:.3f}, hentai={hentai_score:.3f})")
        
        # Warn if NSFW scores are all zero (might indicate model not working)
        if (porn_score == 0.0 and sexy_score == 0.0 and hentai_score == 0.0):
            logger.warning(f"⚠️ NSFW scores are all zero for {photo_job.get('media_id')} - model might not be working properly")
            # If model is not working, reject for safety (better safe than sorry)
            if status == "approved":
                logger.warning(f"⚠️ Rejecting photo due to NSFW model failure (safety measure)")
                status = "rejected"
                reason = "nsfw_check_failed"
        
        if status == "approved":
            logger.info(f"✅ Approved: {photo_job.get('media_id')} (passed all checks)")
        else:
            logger.info(f"❌ Rejected: {photo_job.get('media_id')} - reason: {reason}")
        
        return {
            "media_id": photo_job["media_id"],
            "status": status,
            "reason": reason,
            "scores": scores
        }
        
    except Exception as e:
        logger.error(f"Moderation failed for photo {photo_job.get('media_id')}: {e}")
        return {
            "media_id": photo_job["media_id"],
            "status": "failed",
            "reason": str(e),
            "scores": {}
        }


def process_batch_job(job_data: dict) -> dict:
    """Process a batch job (1-9 photos)"""
    logger.info(f"Processing batch job: batch_id={job_data['batch_id']}, photos={len(job_data['photos'])}")
    
    results = []
    for photo in job_data['photos']:
        result = moderate_photo(photo)
        results.append(result)
        time.sleep(0.1)  # Small delay between photos
    
    # Create summary
    total = len(results)
    approved = sum(1 for r in results if r['status'] == 'approved')
    rejected = sum(1 for r in results if r['status'] == 'rejected')
    
    reasons = {}
    for result in results:
        if result['status'] == 'rejected' and result['reason']:
            reasons[result['reason']] = reasons.get(result['reason'], 0) + 1
    
    summary = {
        "total": total,
        "approved": approved,
        "rejected": rejected,
        "reasons": reasons
    }
    
    # Create result message
    result_message = {
        "job_id": job_data['job_id'],
        "batch_id": job_data['batch_id'],
        "user_id": job_data['user_id'],
        "telegram_id": job_data['telegram_id'],
        "results": results,
        "summary": summary,
        "processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    return result_message


def main():
    """Main worker loop"""
    logger.info("🚀 Photo Moderation Worker starting...")
    logger.info(f"Redis: {REDIS_HOST}:{REDIS_PORT}")
    logger.info(f"CompreFace: {COMPREFACE_URL}")
    
    while True:
        try:
            # Blocking pop from queue (5 second timeout)
            result = redis_client.brpop(QUEUE_NAME, timeout=5)
            
            if result is None:
                continue  # Timeout, try again
            
            _, job_json = result
            job_data = json.loads(job_json)
            
            logger.info(f"📥 Received job: batch_id={job_data['batch_id']}")
            
            # Process batch
            moderation_result = process_batch_job(job_data)
            
            # Publish result
            result_json = json.dumps(moderation_result)
            redis_client.publish(RESULTS_CHANNEL, result_json)
            
            logger.info(f"✅ Completed batch: batch_id={job_data['batch_id']}, "
                       f"approved={moderation_result['summary']['approved']}, "
                       f"rejected={moderation_result['summary']['rejected']}")
            
        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.error(f"Error processing job: {e}", exc_info=True)
            time.sleep(1)  # Wait before retrying


if __name__ == "__main__":
    main()

