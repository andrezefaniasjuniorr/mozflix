export type ResolvedStreamMode = 'video' | 'hls' | 'embed';

export interface ResolvedStream {
  url: string;
  mode: ResolvedStreamMode;
  canIframeFallback: boolean;
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

function extractDailymotionId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'dai.ly') {
    return url.pathname.replace(/^\/+/, '').split('/')[0] || null;
  }
  if (host.includes('dailymotion.com')) {
    const m = url.pathname.match(/\/(?:embed\/)?video\/([a-zA-Z0-9]+)/);
    return m?.[1] || null;
  }
  return null;
}

function hasDirectBinaryVideoExtension(urlStr: string): boolean {
  return /\.(mp4|webm|ogg|ogv|mov|m4v|mkv|3gp|avi|flv)(\?|$)/i.test(urlStr);
}

/**
 * Classifica e normaliza o link de stream em segundo plano (MP4 direto, HLS .m3u8 ou Embed/Plataforma)
 * garantindo reprodução automática sem nunca expor URLs ou erros técnicos ao usuário.
 */
export function resolveStreamTarget(rawUrl: string): ResolvedStream | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return { url: trimmed, mode: 'video', canIframeFallback: false };
  }

  let normalized = trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const lowerPath = parsed.pathname.toLowerCase();

    // Dropbox: garante stream direto
    if (host.includes('dropbox.com')) {
      parsed.searchParams.delete('dl');
      parsed.searchParams.set('raw', '1');
      return { url: parsed.toString(), mode: 'video', canIframeFallback: false };
    }

    // Pixeldrain: converte /u/ID para stream direto /api/file/ID
    if (host.includes('pixeldrain.com')) {
      const m = parsed.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)/);
      if (m?.[1]) {
        return {
          url: `https://pixeldrain.com/api/file/${m[1]}`,
          mode: 'video',
          canIframeFallback: true,
        };
      }
    }

    // Google Drive: converte para /preview reproduzível sem CORS
    const driveId = extractGoogleDriveId(parsed);
    if (driveId) {
      return {
        url: `https://drive.google.com/file/d/${driveId}/preview`,
        mode: 'embed',
        canIframeFallback: true,
      };
    }

    // YouTube
    const ytId = extractYouTubeId(parsed);
    if (ytId) {
      return {
        url: `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
        mode: 'embed',
        canIframeFallback: true,
      };
    }

    // Vimeo
    const vimeoId = extractVimeoId(parsed);
    if (vimeoId) {
      return {
        url: `https://player.vimeo.com/video/${vimeoId}?autoplay=1`,
        mode: 'embed',
        canIframeFallback: true,
      };
    }

    // Dailymotion
    const dmId = extractDailymotionId(parsed);
    if (dmId) {
      return {
        url: `https://www.dailymotion.com/embed/video/${dmId}?autoplay=1`,
        mode: 'embed',
        canIframeFallback: true,
      };
    }

    // Ok.ru
    if (host.includes('ok.ru')) {
      const m = parsed.pathname.match(/\/video(?:embed)?\/(\d+)/);
      if (m?.[1]) {
        return {
          url: `https://ok.ru/videoembed/${m[1]}?autoplay=1`,
          mode: 'embed',
          canIframeFallback: true,
        };
      }
    }

    // VK Video
    if (host.includes('vk.com') && parsed.pathname.includes('video')) {
      const m = parsed.pathname.match(/video(-?\d+)_(\d+)/);
      if (m) {
        return {
          url: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&autoplay=1`,
          mode: 'embed',
          canIframeFallback: true,
        };
      }
    }

    // Mega.nz
    if (host.includes('mega.nz')) {
      if (parsed.pathname.startsWith('/file/')) {
        const embedPath = parsed.pathname.replace('/file/', '/embed/');
        return {
          url: `https://mega.nz${embedPath}${parsed.hash}`,
          mode: 'embed',
          canIframeFallback: true,
        };
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return { url: normalized, mode: 'embed', canIframeFallback: true };
      }
    }

    // TeraBox
    if (
      host.includes('terabox') ||
      host.includes('1024terabox') ||
      host.includes('4funbox') ||
      host.includes('mirrobox')
    ) {
      const m = parsed.pathname.match(/\/s\/([a-zA-Z0-9_-]+)/);
      if (m?.[1]) {
        const surl = m[1].startsWith('1') ? m[1].slice(1) : m[1];
        return {
          url: `https://www.terabox.com/sharing/embed?surl=${surl}`,
          mode: 'embed',
          canIframeFallback: true,
        };
      }
      if (lowerPath.includes('embed')) {
        return { url: normalized, mode: 'embed', canIframeFallback: true };
      }
    }

    // Archive.org
    if (host.includes('archive.org') && lowerPath.startsWith('/details/')) {
      const id = parsed.pathname.replace('/details/', '').split('/')[0];
      if (id) {
        return {
          url: `https://archive.org/embed/${id}?autoplay=1`,
          mode: 'embed',
          canIframeFallback: true,
        };
      }
    }

    // Streamtape
    if (host.includes('streamtape.')) {
      const updatedPath = parsed.pathname.replace(/^\/v\//, '/e/');
      return {
        url: `${parsed.origin}${updatedPath}${parsed.search}`,
        mode: 'embed',
        canIframeFallback: true,
      };
    }

    // DoodStream / clones
    if (
      host.includes('dood') ||
      host.includes('d000d') ||
      host.includes('ds2play') ||
      host.includes('doood')
    ) {
      const updatedPath = parsed.pathname.replace(/^\/d\//, '/e/');
      return {
        url: `${parsed.origin}${updatedPath}${parsed.search}`,
        mode: 'embed',
        canIframeFallback: true,
      };
    }

    // GitHub raw file
    if (host === 'github.com' && parsed.pathname.includes('/blob/')) {
      normalized = parsed
        .toString()
        .replace('https://github.com/', 'https://raw.githubusercontent.com/')
        .replace('/blob/', '/');
    }

    const lowerFull = normalized.toLowerCase();

    // Streams HLS (.m3u8)
    if (
      lowerPath.includes('.m3u8') ||
      lowerFull.includes('.m3u8') ||
      parsed.searchParams.get('format')?.toLowerCase() === 'm3u8' ||
      parsed.searchParams.get('type')?.toLowerCase() === 'm3u8'
    ) {
      return { url: normalized, mode: 'hls', canIframeFallback: false };
    }

    // Extensões diretas de vídeo ou Storage
    if (
      hasDirectBinaryVideoExtension(lowerFull) ||
      host.includes('firebasestorage.googleapis.com') ||
      host.includes('storage.googleapis.com')
    ) {
      return { url: normalized, mode: 'video', canIframeFallback: false };
    }

    // Plataformas conhecidas de streaming / embed / player web
    const embedHostHints = [
      'vidsrc',
      '2embed',
      'embed.su',
      'superembed',
      'smashystream',
      'streamwish',
      'wishembed',
      'filemoon',
      'moonplayer',
      'mixdrop',
      'uqload',
      'upstream',
      'voe.sx',
      'vidplay',
      'vidcloud',
      'rabbitstream',
      'megacloud',
      'netu',
      'waaw',
      'hqq',
      'sendvid',
      'gofile.io',
      'mediafire.com',
      'onedrive.live.com',
      '1drv.ms',
      'blogger.com',
      'rumble.com/embed',
      'twitch.tv',
      'kick.com',
    ];
    if (embedHostHints.some((h) => host.includes(h))) {
      return { url: normalized, mode: 'embed', canIframeFallback: true };
    }

    if (
      lowerPath.includes('/embed') ||
      lowerPath.includes('/preview') ||
      lowerPath.includes('/player') ||
      /\/(?:e|v|f|d|play|watch)\/[a-zA-Z0-9_-]+/.test(lowerPath) ||
      lowerPath.endsWith('.html') ||
      lowerPath.endsWith('.php')
    ) {
      return { url: normalized, mode: 'embed', canIframeFallback: true };
    }

    // URL desconhecido sem extensão: tenta vídeo direto e permite fallback automático para player incorporado
    return { url: normalized, mode: 'video', canIframeFallback: true };
  } catch {
    if (trimmed.toLowerCase().includes('.m3u8')) {
      return { url: trimmed, mode: 'hls', canIframeFallback: false };
    }
    return {
      url: trimmed,
      mode: 'video',
      canIframeFallback: !hasDirectBinaryVideoExtension(trimmed),
    };
  }
}
