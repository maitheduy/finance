import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
const app = Object.values(config).every(Boolean) ? (getApps()[0] || initializeApp(config)) : null;

export const db = app ? (databaseId ? getFirestore(app, databaseId) : getFirestore(app)) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut };
