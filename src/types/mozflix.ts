import { Timestamp } from 'firebase/firestore';

export const ADMIN_EMAIL = 'mozflix@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export type PackageType = string;
export type VideoCategory = 'Filme' | 'Série' | 'Canal' | 'Documentário';
export type PinTargetType = 'content' | 'package';

export interface UserProfile {
  uid: string;
  phone: string;
  email: string;
  createdAt: Timestamp | null;
  lastLoginAt: Timestamp | null;
  currentPackage: PackageType | null;
  packageExpiresAt: Timestamp | null;
  activePackageId?: string | null;
  activePackageExpiresAt?: Timestamp | null;
  includeAllContent?: boolean;
  lastRedeemedPin?: string | null;
  singleVideoId?: string | null;
  deviceId: string | null;
  activeSessionToken?: string | null;
  isBlocked: boolean;
  isAdmin: boolean;
  lastPackagePriceMt?: number;
}

export interface SeriesEpisodeMeta {
  id: string;
  season: number;
  episodeNumber: number;
  title: string;
  duration: string;
}

export interface SeriesEpisodeSource extends SeriesEpisodeMeta {
  videoUrl: string;
  videoStoragePath?: string;
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  category: VideoCategory;
  coverUrl: string;
  /** Campo legado — novos títulos guardam o link exclusivamente na coleção protegida videoSources */
  videoUrl?: string;
  coverStoragePath?: string;
  videoStoragePath?: string;
  duration: string;
  individualPriceMt: number;
  isFreeTrailer: boolean;
  active: boolean;
  featured?: boolean;
  episodesMeta?: SeriesEpisodeMeta[];
  views: number;
  createdAt?: Timestamp | null;
}

export interface VideoSource {
  videoId: string;
  videoUrl: string;
  videoStoragePath?: string;
  episodes?: SeriesEpisodeSource[];
  updatedAt?: Timestamp | null;
}

export interface AdminPackage {
  id: string;
  name: string;
  description: string;
  durationHours: number;
  priceMt: number;
  includeAllContent: boolean;
  videoIds: string[];
  active: boolean;
  createdAt?: Timestamp | null;
}

export interface UserEntitlement {
  id: string;
  pinCode: string;
  userId: string;
  targetType: PinTargetType;
  packageId?: string | null;
  packageName: string;
  includeAllContent: boolean;
  videoIds: string[];
  duracaoHoras: number;
  precoMt: number;
  activatedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  deviceId?: string | null;
}

export interface SecurityAlert {
  id: string;
  type: 'DEVICE_LOCK' | 'BLOCKED_ACCESS' | 'PIN_BRUTE_FORCE';
  userId: string;
  userContact: string;
  deviceId?: string;
  details: string;
  createdAt: Timestamp | null;
}

export interface PinCode {
  id: string;
  codigo: string;
  targetType?: PinTargetType;
  packageId?: string | null;
  packageName?: string;
  tipoPacote: string;
  includeAllContent?: boolean;
  videoIds?: string[];
  videoTitles?: string[];
  duracaoHoras: number;
  precoMt: number;
  usado: boolean;
  usadoPor: string | null;
  usadoPorTelefone?: string | null;
  usedDeviceId?: string | null;
  usadoEm?: Timestamp | null;
  desativado: boolean;
  criadoEm: Timestamp | null;
  expiraEm: Timestamp | null;
}

export interface ManualPayment {
  id: string;
  userId: string;
  telefone: string;
  pacote: string;
  valorMt: number;
  transacaoId: string;
  ativadoPorUid: string;
  ativadoPorEmail: string;
  createdAt: Timestamp | null;
}

export interface AdminLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  details: string;
  createdAt: Timestamp | null;
}

export interface AppSettings {
  appName: string;
  primaryColor: string;
  supportWhatsapp: string;
  downloadsEnabled: boolean;
  priceDailyMt: number;
  priceWeekendMt: number;
  priceMonthlyMt: number;
  priceSingleFilmMt: number;
}

export interface WatchSession {
  userId: string;
  userPhone: string;
  videoId: string;
  videoTitle: string;
  updatedAt: Timestamp | null;
  isActive: boolean;
}

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp | null;
}

export interface OfflineDownload {
  videoId: string;
  title: string;
  category: VideoCategory;
  duration: string;
  coverUrl: string;
  description: string;
  sizeBytes: number;
  downloadedAt: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appName: 'MozFlix',
  primaryColor: '#E50914',
  supportWhatsapp: '258840000000',
  downloadsEnabled: true,
  priceDailyMt: 15,
  priceWeekendMt: 30,
  priceMonthlyMt: 150,
  priceSingleFilmMt: 5,
};
