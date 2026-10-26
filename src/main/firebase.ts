import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  Timestamp,
  getCountFromServer
} from 'firebase/firestore'

// User must provide these in .env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
}

// Only initialize if config is mostly valid
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.projectId
const app = isConfigValid ? initializeApp(firebaseConfig) : null
const db = app ? getFirestore(app) : null

export async function recordHeartbeat(installId: string, appVersion: string): Promise<void> {
  if (!db) return
  await setDoc(
    doc(db, 'activity', installId),
    {
      lastSeen: serverTimestamp(),
      appVersion
    },
    { merge: true }
  )
}

export async function getActiveUserStats(): Promise<{ dau: number; mau: number } | null> {
  if (!db) return null
  const dauCutoff = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000)
  const mauCutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [dauSnap, mauSnap] = await Promise.all([
    getCountFromServer(query(collection(db, 'activity'), where('lastSeen', '>=', dauCutoff))),
    getCountFromServer(query(collection(db, 'activity'), where('lastSeen', '>=', mauCutoff)))
  ])
  return { dau: dauSnap.data().count, mau: mauSnap.data().count }
}
