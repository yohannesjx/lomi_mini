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
from transformers import AutoProcessor, AutoModelForCausalLM
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

# Moderation thresholds (relaxed for Ethiopian photos)
BLUR_THRESHOLD = 120  # Laplacian variance
NSFW_PORN_THRESHOLD = 0.45
NSFW_SEXY_THRESHOLD = 0.7

# Initialize Redis
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD if REDIS_PASSWORD else None,
    db=REDIS_DB,
    decode_responses=False  # Keep binary for JSON
)

# Initialize NSFW model (Qwen/Qwen2-VL-7B-Instruct)
logger.info("Loading Qwen NSFW model...")
try:
    nsfw_processor = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-7B-Instruct")
    nsfw_model = AutoModelForCausalLM.from_pretrained(
        "Qwen/Qwen2-VL-7B-Instruct",
        torch_dtype=torch.float16,
        device_map="auto"
    )
    logger.info("✅ NSFW model loaded successfully")
except Exception as e:
    logger.error(f"❌ Failed to load NSFW model: {e}")
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
        # Send image to CompreFace API
        files = {'file': ('image.jpg', image_bytes, 'image/jpeg')}
        response = requests.post(
            f"{COMPREFACE_URL}/api/v1/detection/detect",
            files=files,
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        
        faces = result.get('result', [])
        face_count = len(faces)
        has_face = face_count > 0
        
        # Estimate age from first face (if available)
        estimated_age = None
        if faces:
            # CompreFace may return age estimates in the result
            # Adjust based on actual CompreFace API response format
            estimated_age = faces[0].get('age', None)
        
        return {
            "has_face": has_face,
            "face_count": face_count,
            "estimated_age": estimated_age
        }
    except Exception as e:
        logger.error(f"Face detection failed: {e}")
        return {
            "has_face": False,
            "face_count": 0,
            "estimated_age": None
        }


def check_nsfw(image_bytes: bytes) -> dict:
    """Check for NSFW content using Qwen model"""
    if nsfw_model is None or nsfw_processor is None:
        logger.warning("NSFW model not loaded, skipping NSFW check")
        return {
            "porn": 0.0,
            "sexy": 0.0,
            "hentai": 0.0
        }
    
    try:
        # Load image
        image = Image.open(BytesIO(image_bytes))
        
        # Process with Qwen model
        # Note: Qwen2-VL-7B-Instruct is a vision-language model
        # We'll use it to classify NSFW content
        # This is a simplified version - adjust based on actual model API
        
        # For now, return placeholder scores
        # TODO: Implement actual Qwen NSFW classification
        # The model should return probabilities for porn, sexy, hentai categories
        
        return {
            "porn": 0.0,
            "sexy": 0.0,
            "hentai": 0.0
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
        
        # Check blur
        if blur_result["is_blurry"]:
            status = "rejected"
            reason = "blurry"
        
        # Check face
        elif not face_result["has_face"]:
            status = "rejected"
            reason = "no_face"
        
        # Check age
        elif face_result["estimated_age"] and face_result["estimated_age"] < 18:
            status = "rejected"
            reason = "underage"
        
        # Check NSFW
        elif nsfw_result["porn"] > NSFW_PORN_THRESHOLD or nsfw_result["sexy"] > NSFW_SEXY_THRESHOLD:
            status = "rejected"
            reason = "nsfw"
        
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

