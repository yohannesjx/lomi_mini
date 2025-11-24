import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    UserCredential,
} from 'firebase/auth';

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null = null;

export const ensureFirebaseApp = (): FirebaseApp => {
    if (!firebaseConfig.apiKey) {
        throw new Error(
            'Firebase is not configured. Define EXPO_PUBLIC_FIREBASE_* environment variables.'
        );
    }

    if (!firebaseApp) {
        firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    }
    return firebaseApp;
};

export const signInWithGoogleWeb = async (): Promise<{
    idToken: string;
    credential: UserCredential;
}> => {
    const app = ensureFirebaseApp();
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account',
    });

    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken(true);
    return { idToken, credential };
};

