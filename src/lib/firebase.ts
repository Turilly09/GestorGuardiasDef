import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDBhX68wgQrPXsiIin1sMUTT_LRIYAu8qY",
  authDomain: "gestor-guardias-e36a7.firebaseapp.com",
  projectId: "gestor-guardias-e36a7",
  storageBucket: "gestor-guardias-e36a7.firebasestorage.app",
  messagingSenderId: "51410845092",
  appId: "1:51410845092:web:e8b031342b0b57cf90d531",
  measurementId: "G-MV1G295KTP"
};

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

export const auth = getAuth(app);
