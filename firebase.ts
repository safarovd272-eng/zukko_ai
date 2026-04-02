import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, onSnapshot, orderBy, getDocs, deleteDoc, limit } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Auth Helpers
export const signIn = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

export { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  getDocs, 
  deleteDoc,
  limit,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
};
