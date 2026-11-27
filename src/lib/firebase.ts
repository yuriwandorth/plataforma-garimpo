'use client';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuração pública do app web do Firebase (não é senha: quem protege os dados são as regras do Firestore).
// Um .env.local pode sobrescrever estes valores para apontar para outro projeto.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBYuBtZuSRvedsRAntFOuKh1SBTHCwmRWg',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'plataforma-garimpo.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'plataforma-garimpo',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'plataforma-garimpo.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '610506828538',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:610506828538:web:b51eeca48ba51c34eb3743',
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

export const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth = app ? getAuth(app) : (null as never);
export const db = app ? getFirestore(app) : (null as never);
