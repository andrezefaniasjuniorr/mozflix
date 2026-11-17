export type ResolvedStreamMode = 'video' | 'hls' | 'embed';

export interface ResolvedStream {
  url: string;
  mode: ResolvedStreamMode;
}

function extractGoogleDriveId(url: URL): string | null {
  if (!url.hostname.includes('drive.google.com') && !url.hostname.includes('docs.google.com')) {
    return null;
  }
  const pathMatch = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch?.[1]) return pathMatch[1];
  const idParam = url.searchParams.get('id');
  if (idParam) return idParam;
  return null;
}

function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\/+/, '').split('/')[0];
    return id || null;
  }
  if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/')[2] || null;
    }
    if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')) {
      return url.pathname.split('/')[2] || null;
    }
    const v = url.searchParams.get('v');
    if (v) return v;
  }
  return null;
}

function extractVimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.includes('player.vimeo.com') && url.pathname.includes('/video/')) {
    return url.pathname.split('/video/')[1]?.split('/')[0] || null;
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const seg = url.pathname.replace(/^\/+/, '').split('/')[0];
    if (seg && /^\d+$/.test(seg)) return seg;
  }
  return null;
}

/**
 * Classifica e normaliza o link de stream em segundo plano (MP4 direto, HLS .m3u8 ou Embed/Drive/YouTube)
 * para garantir que filmes, séries e canais abram e rodem sem travar.
 */
export function resolveStreamTarget(rawUrl: string): ResolvedStream | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return { url: trimmed, mode: 'video' };
  }

  let normalized = trimmed;

  try {
    const parsed = new URL(trimmed);

    // Dropbox: garante stream direto
    if (parsed.hostname.includes('dropbox.com')) {
      parsed.searchParams.delete('dl');
      parsed.searchParams.set('raw', '1');
      return { url: parsed.toString(), mode: 'video' };
    }

    // Google Drive: converte para /preview reproduzível sem erro de CORS/HTML
    const driveId = extractGoogleDriveId(parsed);
    if (driveId) {
      return {
        url: `https://drive.google.com/file/d/${driveId}/preview`,
        mode: 'embed',
      };
    }

    // YouTube
    const ytId = extractYouTubeId(parsed);
    if (ytId) {
      return {
        url: `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
        mode: 'embed',
      };
    }

    // Vimeo
    const vimeoId = extractVimeoId(parsed);
    if (vimeoId) {
      return {
        url: `https://player.vimeo.com/video/${vimeoId}?autoplay=1`,
        mode: 'embed',
      };
    }

    // GitHub raw file
    if (parsed.hostname === 'github.com' && parsed.pathname.includes('/blob/')) {
      normalized = parsed
        .toString()
        .replace('https://github.com/', 'https://raw.githubusercontent.com/')
        .replace('/blob/', '/');
    }

    const lowerPath = parsed.pathname.toLowerCase();
    const lowerFull = normalized.toLowerCase();

    // Streams HLS (.m3u8)
    if (
      lowerPath.includes('.m3u8') ||
      lowerFull.includes('.m3u8') ||
      parsed.searchParams.get('format')?.toLowerCase() === 'm3u8' ||
      parsed.searchParams.get('type')?.toLowerCase() === 'm3u8'
    ) {
      return { url: normalized, mode: 'hls' };
    }

    // Extensões diretas de vídeo
    if (/\.(mp4|webm|ogg|ogv|mov|m4v|mkv|3gp|ts)(\?|$)/i.test(lowerFull)) {
      return { url: normalized, mode: 'video' };
    }

    // URLs de embed / leitores web externos
    if (
      lowerPath.includes('/embed') ||
      lowerPath.includes('/preview') ||
      /\/e\/[a-zA-Z0-9_-]+/.test(lowerPath) ||
      parsed.hostname.includes('dailymotion.com') ||
      parsed.hostname.includes('ok.ru') ||
      parsed.hostname.includes('streamtape.') ||
      parsed.hostname.includes('dood') ||
      parsed.hostname.includes('filemoon') ||
      parsed.hostname.includes('mixdrop') ||
      lowerPath.endsWith('.html')
    ) {
      return { url: normalized, mode: 'embed' };
    }

    return { url: normalized, mode: 'video' };
  } catch {
    if (trimmed.toLowerCase().includes('.m3u8')) {
      return { url: trimmed, mode: 'hls' };
    }
    return { url: trimmed, mode: 'video' };
  }
}
