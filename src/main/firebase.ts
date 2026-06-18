import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// User must provide these in .env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

// Only initialize if config is mostly valid
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.projectId;
const app = isConfigValid ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export async function loginToFirebase(idToken: string): Promise<{uid: string, photoURL: string | null}> {
  if (!auth) throw new Error('Firebase is not configured. Missing environment variables.');
  
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return { uid: result.user.uid, photoURL: result.user.photoURL };
}

export async function logoutFromFirebase(): Promise<void> {
  if (auth) {
    await firebaseSignOut(auth);
  }
}

export async function syncConfigToCloud(uid: string, config: any): Promise<void> {
  if (!db) return;
  const userDocRef = doc(db, 'users', uid);
  await setDoc(userDocRef, {
    config,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function fetchConfigFromCloud(uid: string): Promise<any | null> {
  if (!db) return null;
  const userDocRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userDocRef);
  if (snapshot.exists()) {
    return snapshot.data().config;
  }
  return null;
}

export function onCloudConfigChanged(uid: string, callback: (config: any) => void): () => void {
  if (!db) return () => {};
  const userDocRef = doc(db, 'users', uid);
  return onSnapshot(userDocRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data().config);
    }
  });
}
