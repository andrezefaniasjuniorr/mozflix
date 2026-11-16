import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AdminPackage,
  AppSettings,
  DEFAULT_APP_SETTINGS,
  UserEntitlement,
  UserNotification,
  UserProfile,
  VideoItem,
  isAdminEmail,
} from '../types/mozflix';
import {
  generateSessionToken,
  getLocalSessionToken,
  getOrCreateDeviceId,
  normalizeMozPhone,
  phoneToAuthEmail,
} from '../utils/device';
import {
  readCachedEntitlements,
  readCachedPackages,
  readCachedProfile,
  readCachedSettings,
  readCachedUnlockedMap,
  saveCachedEntitlements,
  saveCachedPackages,
  saveCachedProfile,
  saveCachedSettings,
  saveCachedUnlockedMap,
} from '../utils/localSnapshotCache';
import { getMillis } from '../utils/formatters';

export type AuthErrorType = 'device_lock' | 'blocked' | 'general' | null;

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  settings: AppSettings;
  packages: AdminPackage[];
  entitlements: UserEntitlement[];
  unlockedVideosMap: Record<string, number>;
  notifications: UserNotification[];
  loading: boolean;
  authError: string | null;
  authErrorType: AuthErrorType;
  clearAuthError: () => void;
  hasActivePackage: boolean;
  hoursRemaining: number;
  serverNowMs: number;
  deviceId: string;
  canWatchVideo: (video: VideoItem) => boolean;
  getVideoUnlockExpiresAt: (videoId: string) => number | null;
  loginWithPhone: (phone: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string, adminOnly?: boolean) => Promise<void>;
  registerUser: (params: {
    mode: 'phone' | 'email';
    phone: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  markNotificationRead: (notifId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function reportSecurityAlert(params: {
  type: 'DEVICE_LOCK' | 'BLOCKED_ACCESS';
  userId: string;
  userContact: string;
  deviceId: string;
  details: string;
}) {
  try {
    await addDoc(collection(db, 'securityAlerts'), {
      ...params,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Do not block auth UX if alert write fails
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(
    () => readCachedSettings() || DEFAULT_APP_SETTINGS
  );
  const [packages, setPackages] = useState<AdminPackage[]>(() => readCachedPackages());
  const [entitlements, setEntitlements] = useState<UserEntitlement[]>([]);
  const [unlockedVideosMap, setUnlockedVideosMap] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorType, setAuthErrorType] = useState<AuthErrorType>(null);

  // Relógio monotónico imune a alterações manuais de hora do sistema
  const [clockAnchor, setClockAnchor] = useState<{ serverMs: number; perfMs: number }>(() => ({
    serverMs: Date.now(),
    perfMs: typeof performance !== 'undefined' ? performance.now() : 0,
  }));
  const [perfTick, setPerfTick] = useState(() =>
    typeof performance !== 'undefined' ? performance.now() : 0
  );

  const deviceId = getOrCreateDeviceId();
  const isRegisteringRef = useRef(false);
  const clockSyncPendingRef = useRef(false);
  const clockSyncedOnceRef = useRef(false);

  const anchorServerClock = useCallback((serverMs: number) => {
    if (serverMs > 0) {
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
      setClockAnchor({ serverMs, perfMs: nowPerf });
      setPerfTick(nowPerf);
    }
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthErrorType(null);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPerfTick(typeof performance !== 'undefined' ? performance.now() : 0);
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  // Ouvir appSettings/config e guardar em cache local
  useEffect(() => {
    const cached = readCachedSettings();
    if (cached?.primaryColor) {
      document.documentElement.style.setProperty('--mozflix-primary', cached.primaryColor);
    }

    const ref = doc(db, 'appSettings', 'config');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<AppSettings>;
          const merged: AppSettings = {
            ...DEFAULT_APP_SETTINGS,
            ...data,
          };
          setSettings(merged);
          saveCachedSettings(merged);
          document.documentElement.style.setProperty('--mozflix-primary', merged.primaryColor || '#E50914');
        }
      },
      () => {
        // Mantém cache ou defaults em modo offline
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    let profileUnsub: Unsubscribe | null = null;
    let notifUnsub: Unsubscribe | null = null;
    let unlockedUnsub: Unsubscribe | null = null;
    let entUnsub: Unsubscribe | null = null;
    let pkgUnsub: Unsubscribe | null = null;

    const cleanupUserListeners = () => {
      if (profileUnsub) profileUnsub();
      if (notifUnsub) notifUnsub();
      if (unlockedUnsub) unlockedUnsub();
      if (entUnsub) entUnsub();
      if (pkgUnsub) pkgUnsub();
      profileUnsub = null;
      notifUnsub = null;
      unlockedUnsub = null;
      entUnsub = null;
      pkgUnsub = null;
    };

    const authUnsub = onAuthStateChanged(auth, async (user) => {
      cleanupUserListeners();

      if (!user) {
        clockSyncPendingRef.current = false;
        clockSyncedOnceRef.current = false;
        setFirebaseUser(null);
        setProfile(null);
        setPackages([]);
        setEntitlements([]);
        setUnlockedVideosMap({});
        setNotifications([]);
        setLoading(false);
        return;
      }

      setFirebaseUser(user);

      // Hidratar imediatamente do armazenamento local para abrir instantaneamente offline (0 megas)
      const cachedProf = readCachedProfile(user.uid);
      const cachedEnts = readCachedEntitlements(user.uid);
      const cachedUnlocked = readCachedUnlockedMap(user.uid);
      const cachedPkgs = readCachedPackages();
      if (cachedPkgs.length > 0) setPackages(cachedPkgs);
      if (cachedEnts.length > 0) setEntitlements(cachedEnts);
      if (Object.keys(cachedUnlocked).length > 0) setUnlockedVideosMap(cachedUnlocked);
      if (cachedProf && !cachedProf.isBlocked) {
        setProfile(cachedProf);
        setLoading(false);
      }

      if (isRegisteringRef.current) {
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      profileUnsub = onSnapshot(
        userRef,
        async (snap) => {
          const rootAdmin = isAdminEmail(user.email);
          if (!snap.exists()) {
            if (snap.metadata.fromCache && cachedProf) {
              setLoading(false);
              return;
            }
            if (rootAdmin && navigator.onLine) {
              await setDoc(userRef, {
                uid: user.uid,
                phone: '',
                email: user.email || 'mozflix@gmail.com',
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
                currentPackage: null,
                packageExpiresAt: null,
                deviceId: null,
                isBlocked: false,
                isAdmin: true,
              });
              return;
            }
            setProfile(cachedProf || null);
            setLoading(false);
            return;
          }

          const rawData = snap.data() as Omit<UserProfile, 'uid'>;
          const data: UserProfile = {
            uid: snap.id,
            ...rawData,
            isAdmin: rawData.isAdmin || rootAdmin,
          };

          if (navigator.onLine && !snap.metadata.hasPendingWrites && !snap.metadata.fromCache) {
            const loginMs = getMillis(rawData.lastLoginAt);
            if (!clockSyncedOnceRef.current && !clockSyncPendingRef.current) {
              clockSyncPendingRef.current = true;
              updateDoc(userRef, { lastLoginAt: serverTimestamp() }).catch(() => {
                clockSyncPendingRef.current = false;
                clockSyncedOnceRef.current = true;
              });
            } else if (clockSyncPendingRef.current && loginMs > 0) {
              clockSyncPendingRef.current = false;
              clockSyncedOnceRef.current = true;
              anchorServerClock(loginMs);
            }
          }

          if (rootAdmin && !rawData.isAdmin && navigator.onLine) {
            updateDoc(userRef, { isAdmin: true }).catch(() => undefined);
          }

          if (data.isBlocked && !rootAdmin) {
            setAuthError('Conta bloqueada. Contacta o suporte.');
            setAuthErrorType('blocked');
            setProfile(null);
            await signOut(auth);
            setLoading(false);
            return;
          }

          if (!data.isAdmin && data.deviceId && data.deviceId !== deviceId) {
            if (navigator.onLine) {
              await reportSecurityAlert({
                type: 'DEVICE_LOCK',
                userId: user.uid,
                userContact: data.phone || data.email || user.uid,
                deviceId,
                details: `Tentativa bloqueada noutro dispositivo (${deviceId} vs ${data.deviceId}).`,
              });
            }
            setAuthError(
              'Esta conta já está em uso noutro dispositivo. Fala com o suporte no WhatsApp.'
            );
            setAuthErrorType('device_lock');
            setProfile(null);
            await signOut(auth);
            setLoading(false);
            return;
          }

          const localToken = getLocalSessionToken();
          if (
            !data.isAdmin &&
            data.activeSessionToken &&
            localToken &&
            data.activeSessionToken !== localToken
          ) {
            setAuthError('Sessão encerrada por novo início de sessão.');
            setAuthErrorType('device_lock');
            setProfile(null);
            await signOut(auth);
            setLoading(false);
            return;
          }

          if (!data.deviceId && !data.isAdmin && navigator.onLine) {
            try {
              const token = localToken || generateSessionToken();
              await updateDoc(userRef, {
                deviceId,
                activeSessionToken: token,
                lastLoginAt: serverTimestamp(),
              });
            } catch {
              // Ignore transient update error
            }
          }

          saveCachedProfile(user.uid, data);
          setProfile(data);
          setLoading(false);
        },
        (error) => {
          setLoading(false);
          if (!navigator.onLine || cachedProf) {
            return;
          }
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      );

      pkgUnsub = onSnapshot(
        query(collection(db, 'packages'), orderBy('createdAt', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminPackage, 'id'>),
          }));
          setPackages(list);
          saveCachedPackages(list);
        },
        () => {
          // Mantém pacotes em cache offline
        }
      );

      unlockedUnsub = onSnapshot(
        collection(db, 'users', user.uid, 'unlockedVideos'),
        (snap) => {
          const map: Record<string, number> = {};
          snap.docs.forEach((d) => {
            const expMs = getMillis(d.data()?.expiresAt);
            if (expMs > 0) map[d.id] = expMs;
          });
          setUnlockedVideosMap(map);
          saveCachedUnlockedMap(user.uid, map);
        },
        () => {
          // Mantém cache offline
        }
      );

      entUnsub = onSnapshot(
        query(collection(db, 'users', user.uid, 'entitlements'), orderBy('activatedAt', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UserEntitlement, 'id'>),
          }));
          setEntitlements(list);
          saveCachedEntitlements(user.uid, list);
        },
        () => {
          // Mantém cache offline
        }
      );

      const notifQuery = query(
        collection(db, 'users', user.uid, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      notifUnsub = onSnapshot(
        notifQuery,
        (snap) => {
          setNotifications(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<UserNotification, 'id'>),
            }))
          );
        },
        () => {
          // Optional
        }
      );
    });

    return () => {
      authUnsub();
      cleanupUserListeners();
    };
  }, [deviceId, anchorServerClock]);

  const validateAfterSignIn = useCallback(
    async (user: User, adminOnly = false) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      const rootAdmin = isAdminEmail(user.email);

      if (!snap.exists()) {
        if (adminOnly && !rootAdmin) {
          await signOut(auth);
          throw new Error('Acesso negado.');
        }
        const token = rootAdmin ? null : generateSessionToken();
        await setDoc(userRef, {
          uid: user.uid,
          phone: '',
          email: user.email || '',
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          currentPackage: null,
          packageExpiresAt: null,
          deviceId: rootAdmin ? null : deviceId,
          activeSessionToken: token,
          isBlocked: false,
          isAdmin: rootAdmin,
        });
        return;
      }

      const data = snap.data() as Omit<UserProfile, 'uid'>;
      const effectiveAdmin = Boolean(data.isAdmin || rootAdmin);

      if (data.isBlocked && !rootAdmin) {
        await reportSecurityAlert({
          type: 'BLOCKED_ACCESS',
          userId: user.uid,
          userContact: data.phone || data.email || user.uid,
          deviceId,
          details: 'Utilizador bloqueado tentou iniciar sessão.',
        });
        await signOut(auth);
        setAuthError('Conta bloqueada. Contacta o suporte.');
        setAuthErrorType('blocked');
        throw new Error('Conta bloqueada. Contacta o suporte.');
      }

      if (adminOnly && !effectiveAdmin) {
        await signOut(auth);
        throw new Error('Acesso restrito a administradores.');
      }

      if (!effectiveAdmin && data.deviceId && data.deviceId !== deviceId) {
        await reportSecurityAlert({
          type: 'DEVICE_LOCK',
          userId: user.uid,
          userContact: data.phone || data.email || user.uid,
          deviceId,
          details: `Tentativa de login em 2º dispositivo (${deviceId}).`,
        });
        await signOut(auth);
        const msg =
          'Esta conta já está em uso noutro dispositivo. Fala com o suporte no WhatsApp.';
        setAuthError(msg);
        setAuthErrorType('device_lock');
        throw new Error(msg);
      }

      const sessionToken = effectiveAdmin ? null : generateSessionToken();
      await updateDoc(userRef, {
        deviceId: effectiveAdmin ? data.deviceId : data.deviceId || deviceId,
        activeSessionToken: sessionToken,
        isAdmin: effectiveAdmin,
        lastLoginAt: serverTimestamp(),
      });

      const fresh = await getDoc(userRef);
      const serverTs = getMillis(fresh.data()?.lastLoginAt);
      if (serverTs > 0) {
        clockSyncedOnceRef.current = true;
        anchorServerClock(serverTs);
      }
    },
    [deviceId, anchorServerClock]
  );

  const loginWithPhone = useCallback(
    async (phone: string, password: string) => {
      clearAuthError();
      const normalized = normalizeMozPhone(phone);
      if (normalized.length < 12) {
        throw new Error('Número inválido (ex: 84 123 4567).');
      }
      const syntheticEmail = phoneToAuthEmail(normalized);
      const cred = await signInWithEmailAndPassword(auth, syntheticEmail, password);
      await validateAfterSignIn(cred.user, false);
    },
    [clearAuthError, validateAfterSignIn]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string, adminOnly = false) => {
      clearAuthError();
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await validateAfterSignIn(cred.user, adminOnly);
    },
    [clearAuthError, validateAfterSignIn]
  );

  const registerUser = useCallback(
    async ({
      mode,
      phone,
      email,
      password,
    }: {
      mode: 'phone' | 'email';
      phone: string;
      email: string;
      password: string;
    }) => {
      clearAuthError();
      const normalizedPhone = phone.trim() ? normalizeMozPhone(phone) : '';
      if (mode === 'phone' && normalizedPhone.length < 12) {
        throw new Error('Número de Moçambique inválido (ex: 84 123 4567).');
      }

      const authEmail =
        mode === 'phone' ? phoneToAuthEmail(normalizedPhone) : email.trim();
      if (!authEmail) {
        throw new Error('Email inválido.');
      }

      isRegisteringRef.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, authEmail, password);
        const userRef = doc(db, 'users', cred.user.uid);
        const rootAdmin = isAdminEmail(authEmail);
        const token = rootAdmin ? null : generateSessionToken();
        await setDoc(userRef, {
          uid: cred.user.uid,
          phone: normalizedPhone,
          email: email.trim() || (mode === 'email' ? authEmail : ''),
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          currentPackage: null,
          packageExpiresAt: null,
          deviceId: rootAdmin ? null : deviceId,
          activeSessionToken: token,
          isBlocked: false,
          isAdmin: rootAdmin,
        });
        isRegisteringRef.current = false;
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const serverTs = getMillis(snap.data()?.lastLoginAt);
          if (serverTs > 0) {
            clockSyncedOnceRef.current = true;
            anchorServerClock(serverTs);
          }
          setProfile({ uid: snap.id, ...(snap.data() as Omit<UserProfile, 'uid'>) });
        }
      } catch (err) {
        isRegisteringRef.current = false;
        throw err;
      }
    },
    [clearAuthError, deviceId, anchorServerClock]
  );

  const logout = useCallback(async () => {
    clearAuthError();
    await signOut(auth);
    setProfile(null);
  }, [clearAuthError]);

  const markNotificationRead = useCallback(
    async (notifId: string) => {
      if (!firebaseUser) return;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid, 'notifications', notifId), {
          read: true,
        });
      } catch {
        // Ignore
      }
    },
    [firebaseUser]
  );

  const serverNowMs = clockAnchor.serverMs + Math.max(0, perfTick - clockAnchor.perfMs);

  const activeEntitlements = entitlements.filter((e) => getMillis(e.expiresAt) > serverNowMs);
  const expMs = getMillis(profile?.packageExpiresAt);
  const activePkgExpMs = getMillis(profile?.activePackageExpiresAt);
  const maxActiveExpiryMs = Math.max(
    expMs > serverNowMs ? expMs : 0,
    activePkgExpMs > serverNowMs ? activePkgExpMs : 0,
    ...activeEntitlements
      .filter((e) => e.targetType === 'package')
      .map((e) => getMillis(e.expiresAt))
  );

  const hasActivePackage = maxActiveExpiryMs > serverNowMs;
  const hoursRemaining = hasActivePackage
    ? Math.max(1, Math.ceil((maxActiveExpiryMs - serverNowMs) / (1000 * 60 * 60)))
    : 0;

  const getVideoUnlockExpiresAt = useCallback(
    (videoId: string): number | null => {
      const candidates: number[] = [];

      const uvExp = unlockedVideosMap[videoId];
      if (uvExp && uvExp > serverNowMs) candidates.push(uvExp);

      if (profile?.includeAllContent && expMs > serverNowMs) {
        candidates.push(expMs);
      }

      if (profile?.activePackageId && activePkgExpMs > serverNowMs) {
        const pkg = packages.find((p) => p.id === profile.activePackageId);
        if (pkg && (pkg.includeAllContent || pkg.videoIds.includes(videoId))) {
          candidates.push(activePkgExpMs);
        }
      }

      for (const ent of activeEntitlements) {
        const eExp = getMillis(ent.expiresAt);
        if (eExp <= serverNowMs) continue;
        if (ent.includeAllContent || ent.videoIds?.includes(videoId)) {
          candidates.push(eExp);
        } else if (ent.packageId) {
          const pkg = packages.find((p) => p.id === ent.packageId);
          if (pkg && (pkg.includeAllContent || pkg.videoIds.includes(videoId))) {
            candidates.push(eExp);
          }
        }
      }

      // Compatibilidade legada
      if (
        profile?.currentPackage &&
        expMs > serverNowMs &&
        profile.includeAllContent === undefined &&
        profile.activePackageId === undefined &&
        (profile.currentPackage !== 'Por Filme' || profile.singleVideoId === videoId)
      ) {
        candidates.push(expMs);
      }

      return candidates.length > 0 ? Math.max(...candidates) : null;
    },
    [
      unlockedVideosMap,
      serverNowMs,
      profile,
      expMs,
      activePkgExpMs,
      packages,
      activeEntitlements,
    ]
  );

  const canWatchVideo = useCallback(
    (video: VideoItem): boolean => {
      if (!video) return false;
      if (profile?.isAdmin) return true;
      if (video.isFreeTrailer) return true;
      return getVideoUnlockExpiresAt(video.id) !== null;
    },
    [profile?.isAdmin, getVideoUnlockExpiresAt]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        settings,
        packages,
        entitlements,
        unlockedVideosMap,
        notifications,
        loading,
        authError,
        authErrorType,
        clearAuthError,
        hasActivePackage,
        hoursRemaining,
        serverNowMs,
        deviceId,
        canWatchVideo,
        getVideoUnlockExpiresAt,
        loginWithPhone,
        loginWithEmail,
        registerUser,
        logout,
        markNotificationRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return ctx;
}
