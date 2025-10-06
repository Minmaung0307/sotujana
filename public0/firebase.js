// firebase.js — central Firebase + config + theme helpers
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { getStorage }     from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

// ===== Fill these before deploy =====
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAXLNT_QRsQhdNa4lvJDpEm2q4z8frlvIE",
  authDomain: "sitagu-mm.firebaseapp.com",
  projectId: "sitagu-mm",
  storageBucket: "sitagu-mm.firebasestorage.app",
  messagingSenderId: "984537608489",
  appId: "1:984537608489:web:4464d2b36b55498254c738",
  measurementId: "G-6T0MDFL7PD"
};
// EmailJS (emailjs.com)
export const EMAILJS_PUBLIC_KEY = "WT0GOYrL9HnDKvLUf";
export const EMAILJS_SERVICE_ID  = "service_z9tkmvr";
export const EMAILJS_TEMPLATE_ID = "template_q5q471f"; // vars: title, body, url, to_email


// Init
export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const st   = getStorage(app);

// Theme / font helpers
export function applyPrefs(){
  const t = localStorage.getItem('theme') || 'light';
  const f = localStorage.getItem('font')  || 'base';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-font', f);
}
applyPrefs();