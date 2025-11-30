import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDNeQid9j7i9tL07Tv08hq3g5O5S8BHfcI",
    authDomain: "nfc-reader-21749.firebaseapp.com",
    projectId: "nfc-reader-21749",
    storageBucket: "nfc-reader-21749.firebasestorage.app",
    messagingSenderId: "79995237308",
    appId: "1:79995237308:web:82f76e105cc949c01131b9",
    measurementId: "G-3N1WS47FE4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
