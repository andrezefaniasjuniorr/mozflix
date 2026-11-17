import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Configuração exata do projeto MozFlix (mozflix-e39cc)
const firebaseConfig = {
  apiKey: "AIzaSyCbCJFSHoob1VI2CpMj4rVWHs92aCR3y_A",
  authDomain: "mozflix-e39cc.firebaseapp.com",
  projectId: "mozflix-e39cc",
  storageBucket: "mozflix-e39cc.firebasestorage.app",
  messagingSenderId: "499073544639",
  appId: "1:499073544639:web:7f3da46bd54b78b2b7710a",
  measurementId: "G-D2GE3GG96J"
};

export const app = initializeApp(firebaseConfig);
export let analytics: Analytics | null = null;

if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}

export const auth = getAuth(app);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  firestoreInstance = getFirestore(app);
}
export const db = firestoreInstance;

export const storage = getStorage(app);
// Evita que uploads fiquem presos a 0% por 10 minutos se o bucket/CORS falhar
storage.maxUploadRetryTime = 12000;
storage.maxOperationRetryTime = 12000;

export const functions = getFunctions(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('[MozFlix Sync]', errInfo);
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    console.error('[MozFlix Sync]', error);
  }
}

void testConnection();
