import { Timestamp } from 'firebase/firestore';
import {
  AdminPackage,
  AppSettings,
  UserEntitlement,
  UserProfile,
  VideoItem,
} from '../types/mozflix';

function serializeTs(value: unknown): unknown {
  if (!value) return value;
  if (typeof value === 'object' && value !== null && typeof (value as Timestamp).toMillis === 'function') {
    return { __tsMs: (value as Timestamp).toMillis() };
  }
  if (Array.isArray(value)) {
    return value.map(serializeTs);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeTs(v);
    }
    return out;
  }
  return value;
}

function deserializeTs<T>(value: unknown): T {
  if (!value) return value as T;
  if (Array.isArray(value)) {
    return value.map((item) => deserializeTs(item)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.__tsMs === 'number' && Object.keys(rec).length === 1) {
      return Timestamp.fromMillis(rec.__tsMs) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      out[k] = deserializeTs(v);
    }
    return out as T;
  }
  return value as T;
}

function safeSave(key: string, data: unknown) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(serializeTs(data)));
  } catch {
    // Ignore quota errors
  }
}

function safeRead<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return deserializeTs<T>(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCachedSettings(settings: AppSettings) {
  safeSave('mozflix_cache_settings', settings);
}

export function readCachedSettings(): AppSettings | null {
  return safeRead<AppSettings>('mozflix_cache_settings');
}

export function saveCachedVideos(videos: VideoItem[]) {
  safeSave('mozflix_cache_videos', videos);
}

export function readCachedVideos(): VideoItem[] {
  return safeRead<VideoItem[]>('mozflix_cache_videos') || [];
}

export function saveCachedPackages(packages: AdminPackage[]) {
  safeSave('mozflix_cache_packages', packages);
}

export function readCachedPackages(): AdminPackage[] {
  return safeRead<AdminPackage[]>('mozflix_cache_packages') || [];
}

export function saveCachedProfile(uid: string, profile: UserProfile) {
  safeSave(`mozflix_cache_profile_${uid}`, profile);
}

export function readCachedProfile(uid: string): UserProfile | null {
  return safeRead<UserProfile>(`mozflix_cache_profile_${uid}`);
}

export function saveCachedEntitlements(uid: string, entitlements: UserEntitlement[]) {
  safeSave(`mozflix_cache_entitlements_${uid}`, entitlements);
}

export function readCachedEntitlements(uid: string): UserEntitlement[] {
  return safeRead<UserEntitlement[]>(`mozflix_cache_entitlements_${uid}`) || [];
}

export function saveCachedUnlockedMap(uid: string, map: Record<string, number>) {
  safeSave(`mozflix_cache_unlocked_${uid}`, map);
}

export function readCachedUnlockedMap(uid: string): Record<string, number> {
  return safeRead<Record<string, number>>(`mozflix_cache_unlocked_${uid}`) || {};
}
