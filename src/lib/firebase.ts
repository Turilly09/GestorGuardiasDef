// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDBhX68wgQrPXsiIin1sMUTT_LRIYAu8qY",
  authDomain: "gestor-guardias-e36a7.firebaseapp.com",
  projectId: "gestor-guardias-e36a7",
  storageBucket: "gestor-guardias-e36a7.firebasestorage.app",
  messagingSenderId: "51410845092",
  appId: "1:51410845092:web:e8b031342b0b57cf90d531",
  measurementId: "G-MV1G295KTP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);