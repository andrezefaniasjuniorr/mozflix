import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase';
import { forceHttpStreamUrl } from './streamResolver';

export interface CoverUploadResult {
  url: string;
  storagePath: string;
  mode: 'storage' | 'inline';
}

/**
 * Comprime qualquer imagem para JPEG otimizado (max 720px) para envio rápido e preview imediato.
 */
export async function compressCoverImage(
  file: File
): Promise<{ blob: Blob; dataUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      el.src = objectUrl;
    });

    const maxDim = 720;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Falha ao processar imagem.');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 260_000 && quality > 0.45) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Erro ao gerar imagem comprimida.'))),
        'image/jpeg',
        quality
      );
    });

    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Faz upload da capa para o Firebase Storage com deteção de bloqueio/CORS a 0%.
 * Se o Storage não responder em 7 segundos ou recusar por CORS/regras, usa a versão otimizada inline.
 */
export async function uploadCoverWithFallback(
  file: File,
  onProgress: (pct: number) => void
): Promise<CoverUploadResult> {
  onProgress(10);
  const { blob, dataUrl } = await compressCoverImage(file);
  onProgress(25);

  const cleanName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`;
  const storagePath = `covers/${cleanName}`;
  const storageRef = ref(storage, storagePath);

  return new Promise<CoverUploadResult>((resolve) => {
    let settled = false;
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: 'image/jpeg',
    });

    const stallTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          task.cancel();
        } catch {
          // ignore
        }
        onProgress(100);
        resolve({ url: dataUrl, storagePath: '', mode: 'inline' });
      }
    }, 7000);

    task.on(
      'state_changed',
      (snap) => {
        if (settled) return;
        if (snap.bytesTransferred > 0) {
          window.clearTimeout(stallTimer);
        }
        const pct = 25 + Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 75);
        onProgress(Math.min(99, pct));
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(stallTimer);
        onProgress(100);
        resolve({ url: dataUrl, storagePath: '', mode: 'inline' });
      },
      async () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(stallTimer);
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          onProgress(100);
          resolve({ url, storagePath, mode: 'storage' });
        } catch {
          onProgress(100);
          resolve({ url: dataUrl, storagePath: '', mode: 'inline' });
        }
      }
    );
  });
}

export function normalizeStreamUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  let normalized = trimmed;
  if (normalized.includes('dropbox.com') && normalized.includes('dl=0')) {
    normalized = normalized.replace('dl=0', 'raw=1');
  }
  return forceHttpStreamUrl(normalized);
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
