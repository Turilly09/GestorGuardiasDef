import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  projectId: "clever-oarlock-dxfb9",
  appId: "1:43962789878:web:e17a2ab25a55e3cd0421d7",
  apiKey: "AIzaSyDtrUSLYjXPl8OQyvG9GQMSgsFVa9Pfh3c",
  authDomain: "clever-oarlock-dxfb9.firebaseapp.com",
  storageBucket: "clever-oarlock-dxfb9.firebasestorage.app",
  messagingSenderId: "43962789878"
};

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

export const auth = getAuth(app);
