// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // ✅ NEW: import Firestore

const firebaseConfig = {
  apiKey: "AIzaSyB9Hbm7j7peH8Wali30sWEQ9Od-Na6bfc0",
  authDomain: "tidytap-f02ef.firebaseapp.com",
  projectId: "tidytap-f02ef",
  storageBucket: "tidytap-f02ef.appspot.com",
  messagingSenderId: "84206398746",
  appId: "1:84206398746:web:7eda2b9b193036c36690a3",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app); // ✅ NEW: initialize Firestore

// ✅ Expose auth globally for DevTools token debugging
window.auth = auth;

export { auth, provider, signInWithPopup, db }; // ✅ NEW: export db
