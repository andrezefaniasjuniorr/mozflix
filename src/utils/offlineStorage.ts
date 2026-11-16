import { OfflineDownload, VideoItem } from '../types/mozflix';

const DB_NAME = 'mozflix_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'downloads';

interface StoredDownloadRecord extends OfflineDownload {
  blob: Blob;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideoForOffline(
  video: VideoItem,
  resolvedStreamUrl: string,
  onProgress?: (percent: number) => void,
  options?: {
    downloadId?: string;
    titleOverride?: string;
    durationOverride?: string;
  }
): Promise<OfflineDownload> {
  if (!resolvedStreamUrl) {
    throw new Error('Link de stream indisponível.');
  }
  if (resolvedStreamUrl.toLowerCase().includes('.m3u8')) {
    throw new Error('Canais ou streams .m3u8 ao vivo não suportam offline.');
  }

  const response = await fetch(resolvedStreamUrl, { mode: 'cors' });
  if (!response.ok) {
    throw new Error('Não foi possível transferir o vídeo.');
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();

  let blob: Blob;
  if (reader) {
    const chunks: BlobPart[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (contentLength > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((received / contentLength) * 100)));
        }
      }
    }
    blob = new Blob(chunks, { type: response.headers.get('content-type') || 'video/mp4' });
  } else {
    blob = await response.blob();
  }

  onProgress?.(100);

  const record: StoredDownloadRecord = {
    videoId: options?.downloadId || video.id,
    title: options?.titleOverride || video.title,
    category: video.category,
    duration: options?.durationOverride || video.duration,
    coverUrl: video.coverUrl,
    description: video.description,
    sizeBytes: blob.size,
    downloadedAt: Date.now(),
    blob,
  };

  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const { blob: _ignored, ...meta } = record;
  return meta;
}

export async function listOfflineDownloads(): Promise<OfflineDownload[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return [];
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const rows = (req.result as StoredDownloadRecord[]).map(({ blob: _b, ...meta }) => meta);
      rows.sort((a, b) => b.downloadedAt - a.downloadedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineVideoUrl(videoId: string): Promise<string | null> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(videoId);
    req.onsuccess = () => {
      const record = req.result as StoredDownloadRecord | undefined;
      if (!record?.blob) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(record.blob));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineDownload(videoId: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(videoId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
