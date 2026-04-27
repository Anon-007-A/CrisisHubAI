import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo.appspot.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://demo-project.firebaseio.com',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000:web:000'
};

const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

let app, db, auth, rtdb;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  rtdb = getDatabase(app);

  if (useEmulator) {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    console.info('[Firebase] Connected to local emulator');
  }
} catch (e) {
  console.warn('Firebase initialization failed:', e.message);
  app = initializeApp(firebaseConfig, 'fallback');
  db = getFirestore(app);
  auth = getAuth(app);
  rtdb = getDatabase(app);
}

export { db, rtdb, auth, useEmulator };
