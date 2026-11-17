
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDSA6udKSztIKi460-f3yFJDFkjWndQKnk",
  authDomain: "hirehub-4f634.firebaseapp.com",
  projectId: "hirehub-4f634",
  storageBucket: "hirehub-4f634.firebasestorage.app",
  messagingSenderId: "793596107882",
  appId: "1:793596107882:web:f37363c31ab2af7b25fe13",
  measurementId: "G-GJY4H3R9HW",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export default app;
