import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  doc,
  deleteDoc,
  getDoc,
  getDocFromCache,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SeriesEpisodeSource, VideoItem, VideoSource } from '../types/mozflix';
import {
  encodeStreamProxyUrl,
  isStreamTunnelAvailable,
  resolveStreamTarget,
} from '../utils/streamResolver';
import { reportBackgroundError } from '../utils/errorSanitizer';

interface VideoPlayerModalProps {
  video: VideoItem | null;
  initialEpisodeId?: string | null;
  offlineBlobUrl?: string | null;
  onClose: () => void;
}

type QualityOption = 'Auto' | '1080p' | '720p' | '480p';

interface LoadedVaultSource {
  videoId: string;
  defaultUrl: string;
  episodes: SeriesEpisodeSource[];
}

function getDocWithTimeout(ref: ReturnType<typeof doc>, timeoutMs = 4500) {
  return Promise.race([
    getDoc(ref),
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    ),
  ]);
}

export function VideoPlayerModal({
  video,
  initialEpisodeId,
  offlineBlobUrl,
  onClose,
}: VideoPlayerModalProps) {
  const { firebaseUser, profile, settings, canWatchVideo } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fallbackAttemptRef = useRef(0);

  const [vaultSource, setVaultSource] = useState<LoadedVaultSource | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(initialEpisodeId || null);
  const [episodeMenuOpen, setEpisodeMenuOpen] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [autoMutedNotice, setAutoMutedNotice] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [quality, setQuality] = useState<QualityOption>('Auto');
  const [hlsLevels, setHlsLevels] = useState<{ index: number; label: string }[]>([]);
  const [activeHlsLevel, setActiveHlsLevel] = useState<number>(-1);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [tunnelReady, setTunnelReady] = useState<boolean | null>(null);

  const canPlayCurrentVideo = Boolean(video && (offlineBlobUrl || canWatchVideo(video)));
  const videoId = video?.id || null;

  // Fechar imediatamente se bloqueado ou se o acesso expirar
  useEffect(() => {
    if (!video) return;
    if (profile?.isBlocked || !canPlayCurrentVideo) {
      onClose();
    }
  }, [video, profile?.isBlocked, canPlayCurrentVideo, onClose]);

  // 1. Buscar o link secreto / episódios do título em segundo plano com timeout + fallback cache
  useEffect(() => {
    if (!video) {
      setVaultSource(null);
      setSourceReady(false);
      setActiveEpisodeId(null);
      setEmbedUrl(null);
      return;
    }

    let cancelled = false;
    setEpisodeMenuOpen(false);
    setQualityMenuOpen(false);
    setAutoMutedNotice(false);
    setCurrentTime(0);
    setDuration(0);
    setHlsLevels([]);
    setActiveHlsLevel(-1);

    if (offlineBlobUrl) {
      setVaultSource({ videoId: video.id, defaultUrl: offlineBlobUrl, episodes: [] });
      setActiveEpisodeId(null);
      setSourceReady(true);
      return;
    }

    setSourceReady(false);
    setBuffering(true);
    setVaultSource(null);
    setActiveEpisodeId(initialEpisodeId || null);

    const loadSecretSource = async () => {
      const ref = doc(db, 'videoSources', video.id);
      let srcData: VideoSource | null = null;

      const tunnelPromise = isStreamTunnelAvailable().then((ok) => {
        if (!cancelled) setTunnelReady(ok);
        return ok;
      });

      try {
        const snap = await getDocWithTimeout(ref, 4500);
        if (snap.exists()) {
          srcData = snap.data() as VideoSource;
        }
      } catch (err) {
        reportBackgroundError(err);
        try {
          const cached = await getDocFromCache(ref);
          if (cached.exists()) {
            srcData = cached.data() as VideoSource;
          }
        } catch {
          // Segue silenciosamente
        }
      }

      await tunnelPromise.catch(() => false);

      if (cancelled) return;

      const sortedEpisodes: SeriesEpisodeSource[] = Array.isArray(srcData?.episodes)
        ? [...srcData.episodes].sort(
            (a, b) => a.season - b.season || a.episodeNumber - b.episodeNumber
          )
        : [];

      const fallbackUrl = srcData?.videoUrl || video.videoUrl || '';

      setVaultSource({
        videoId: video.id,
        defaultUrl: fallbackUrl,
        episodes: sortedEpisodes,
      });

      if (sortedEpisodes.length > 0) {
        const chosen =
          (initialEpisodeId && sortedEpisodes.find((e) => e.id === initialEpisodeId)) ||
          sortedEpisodes[0];
        setActiveEpisodeId(chosen?.id || null);
      } else {
        setActiveEpisodeId(null);
      }

      setSourceReady(true);
    };

    void loadSecretSource();

    return () => {
      cancelled = true;
    };
  }, [videoId, initialEpisodeId, offlineBlobUrl]);

  const episodes = useMemo(() => vaultSource?.episodes || [], [vaultSource]);

  const activeEpIdx = useMemo(
    () => episodes.findIndex((e) => e.id === activeEpisodeId),
    [episodes, activeEpisodeId]
  );

  const currentEpisode = activeEpIdx >= 0 ? episodes[activeEpIdx] : episodes[0] || null;
  const nextEpisode =
    activeEpIdx >= 0 && activeEpIdx + 1 < episodes.length ? episodes[activeEpIdx + 1] : null;

  const rawStreamUrl = useMemo(() => {
    if (offlineBlobUrl) return offlineBlobUrl;
    if (!vaultSource) return '';
    if (currentEpisode?.videoUrl) return currentEpisode.videoUrl;
    return vaultSource.defaultUrl || '';
  }, [offlineBlobUrl, vaultSource, currentEpisode]);

  const resolvedStream = useMemo(
    () => (rawStreamUrl ? resolveStreamTarget(rawStreamUrl) : null),
    [rawStreamUrl]
  );

  const primaryPlaybackUrl = useMemo(() => {
    if (!resolvedStream) return '';
    if (resolvedStream.requiresTunnel && tunnelReady) {
      return encodeStreamProxyUrl(resolvedStream.url);
    }
    return resolvedStream.url;
  }, [resolvedStream, tunnelReady]);

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // ignore
      }
      hlsRef.current = null;
    }
  }, []);

  const activateIframeFallback = useCallback(() => {
    if (!resolvedStream || !resolvedStream.canIframeFallback) return false;
    cleanupHls();
    const el = videoRef.current;
    if (el) {
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // ignore
      }
    }
    setEmbedUrl(primaryPlaybackUrl || resolvedStream.url);
    setPlaying(true);
    window.setTimeout(() => setBuffering(false), 1200);
    return true;
  }, [resolvedStream, primaryPlaybackUrl, cleanupHls]);

  // 2. Ligar o stream ao leitor com resolução automática (vídeo direto -> HLS -> leitor incorporado)
  useEffect(() => {
    if (!video || !sourceReady) return;

    let cancelled = false;
    const el = videoRef.current;
    fallbackAttemptRef.current = 0;

    cleanupHls();
    setEmbedUrl(null);
    setHlsLevels([]);
    setActiveHlsLevel(-1);
    setIsLiveStream(false);
    setPlaying(false);

    if (!resolvedStream || !primaryPlaybackUrl) {
      setBuffering(false);
      return;
    }

    if (resolvedStream.mode === 'embed') {
      setBuffering(true);
      setEmbedUrl(primaryPlaybackUrl);
      setPlaying(true);
      const t = window.setTimeout(() => {
        if (!cancelled) setBuffering(false);
      }, 1400);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

    if (!el) return;

    setBuffering(true);
    setCurrentTime(0);
    setDuration(0);

    // Watchdog: se um link de plataforma ficar preso sem carregar vídeo direto, tenta player incorporado
    const watchdogId = window.setTimeout(() => {
      if (cancelled) return;
      if (el.readyState === 0 && resolvedStream.canIframeFallback && fallbackAttemptRef.current < 2) {
        fallbackAttemptRef.current = 2;
        activateIframeFallback();
      } else {
        setBuffering(false);
      }
    }, 4500);

    const attemptPlay = async () => {
      try {
        await el.play();
        if (!cancelled) {
          setPlaying(true);
          setBuffering(false);
        }
      } catch {
        try {
          el.muted = true;
          if (!cancelled) {
            setMuted(true);
            setAutoMutedNotice(true);
          }
          await el.play();
          if (!cancelled) {
            setPlaying(true);
            setBuffering(false);
          }
        } catch {
          if (!cancelled) {
            setPlaying(false);
            setBuffering(false);
          }
        }
      }
    };

    const attachNativeVideo = (targetUrl: string) => {
      el.src = targetUrl;
      el.load();
      void attemptPlay();
    };

    const attachHlsWithFallback = (targetUrl: string) => {
      setIsLiveStream(video.category === 'Canal');

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: video.category === 'Canal',
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 1,
          fragLoadingMaxRetry: 1,
        });
        hlsRef.current = hls;
        let networkRetries = 0;
        let mediaRetries = 0;

        hls.loadSource(targetUrl);
        hls.attachMedia(el);

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          if (cancelled) return;
          const mapped = data.levels
            .map((lvl, idx) => ({
              index: idx,
              label: lvl.height ? `${lvl.height}p` : `Nível ${idx + 1}`,
            }))
            .reverse();
          setHlsLevels(mapped);
          void attemptPlay();
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal || cancelled) return;
          reportBackgroundError(data);

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
            networkRetries += 1;
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
            mediaRetries += 1;
            hls.recoverMediaError();
            return;
          }

          cleanupHls();
          if (el.canPlayType('application/vnd.mpegurl') || el.canPlayType('application/x-mpegURL')) {
            attachNativeVideo(targetUrl);
          } else if (resolvedStream.canIframeFallback) {
            activateIframeFallback();
          } else {
            attachNativeVideo(targetUrl);
          }
        });
      } else {
        attachNativeVideo(targetUrl);
      }
    };

    if (resolvedStream.mode === 'hls') {
      attachHlsWithFallback(primaryPlaybackUrl);
    } else {
      attachNativeVideo(primaryPlaybackUrl);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(watchdogId);
      cleanupHls();
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [video, sourceReady, resolvedStream, primaryPlaybackUrl, cleanupHls, activateIframeFallback]);

  // 3. Registar visualização + sessão em segundo plano
  useEffect(() => {
    if (!video || !firebaseUser || !navigator.onLine) return;

    const registerView = async () => {
      try {
        await updateDoc(doc(db, 'videos', video.id), {
          views: increment(1),
        });
      } catch {
        // Ignorar em segundo plano
      }

      try {
        await setDoc(doc(db, 'watchSessions', firebaseUser.uid), {
          userId: firebaseUser.uid,
          userPhone: profile?.phone || profile?.email || firebaseUser.uid,
          videoId: video.id,
          videoTitle: video.title,
          isActive: true,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignorar em segundo plano
      }
    };

    void registerView();

    const heartbeatId = window.setInterval(() => {
      if (!navigator.onLine) return;
      setDoc(doc(db, 'watchSessions', firebaseUser.uid), {
        userId: firebaseUser.uid,
        userPhone: profile?.phone || profile?.email || firebaseUser.uid,
        videoId: video.id,
        videoTitle: video.title,
        isActive: true,
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }, 25000);

    return () => {
      window.clearInterval(heartbeatId);
      if (navigator.onLine) {
        deleteDoc(doc(db, 'watchSessions', firebaseUser.uid)).catch(() => undefined);
      }
    };
  }, [video, firebaseUser, profile?.phone, profile?.email]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!video) return null;

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el || embedUrl) return;
    if (el.paused) {
      void el.play().catch((err) => reportBackgroundError(err));
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const skipSeconds = (delta: number) => {
    const el = videoRef.current;
    if (!el || isLiveStream || embedUrl) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = videoRef.current;
    if (!el || isLiveStream || embedUrl) return;
    const target = Number(e.target.value);
    el.currentTime = target;
    setCurrentTime(target);
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el || embedUrl) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted) setAutoMutedNotice(false);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  const handleSelectHlsLevel = (index: number, label: string) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
    setActiveHlsLevel(index);
    setQuality((label as QualityOption) || 'Auto');
    setQualityMenuOpen(false);
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between"
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      {/* Barra superior — título e episódio, zero links e zero mensagens técnicas */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/85 to-transparent">
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
              {video.title}
              {currentEpisode && (
                <span className="ml-2 text-sm font-medium text-zinc-300">
                  · T{currentEpisode.season} E{currentEpisode.episodeNumber}: {currentEpisode.title}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              {isLiveStream && (
                <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  AO VIVO
                </span>
              )}
              <span>{offlineBlobUrl ? 'Offline' : `${video.category} · ${quality}`}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Área de reprodução */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {embedUrl ? (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={video.title}
            referrerPolicy="no-referrer"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={() => setBuffering(false)}
            className="w-full h-full border-0"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              controls={false}
              playsInline
              preload="auto"
              onClick={togglePlay}
              onWaiting={() => {
                if (videoRef.current && !videoRef.current.paused) {
                  setBuffering(true);
                }
              }}
              onLoadedMetadata={() => {
                setDuration(videoRef.current?.duration || 0);
                setBuffering(false);
              }}
              onLoadedData={() => setBuffering(false)}
              onCanPlay={() => setBuffering(false)}
              onCanPlayThrough={() => setBuffering(false)}
              onPlaying={() => {
                setBuffering(false);
                setPlaying(true);
              }}
              onPause={() => {
                setPlaying(false);
                setBuffering(false);
              }}
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
              onError={(e) => {
                reportBackgroundError(e);
                const el = videoRef.current;

                // Passo 1: tentar HLS se ainda não tentou (usando o túnel HTTP se ativo)
                if (
                  fallbackAttemptRef.current === 0 &&
                  el &&
                  resolvedStream &&
                  primaryPlaybackUrl &&
                  resolvedStream.mode === 'video' &&
                  !hlsRef.current &&
                  Hls.isSupported()
                ) {
                  fallbackAttemptRef.current = 1;
                  try {
                    const hls = new Hls({
                      enableWorker: true,
                      manifestLoadingMaxRetry: 0,
                    });
                    hlsRef.current = hls;
                    hls.loadSource(primaryPlaybackUrl);
                    hls.attachMedia(el);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                      void el.play().catch(() => setBuffering(false));
                    });
                    hls.on(Hls.Events.ERROR, (_ev, data) => {
                      if (data.fatal) {
                        reportBackgroundError(data);
                        cleanupHls();
                        if (!activateIframeFallback()) {
                          setBuffering(false);
                        }
                      }
                    });
                    return;
                  } catch (hlsErr) {
                    reportBackgroundError(hlsErr);
                  }
                }

                // Passo 2: se usou túnel e falhou, tenta diretamente http:// antes do iframe
                if (
                  fallbackAttemptRef.current < 2 &&
                  el &&
                  resolvedStream &&
                  primaryPlaybackUrl !== resolvedStream.url
                ) {
                  fallbackAttemptRef.current = 2;
                  el.src = resolvedStream.url;
                  el.load();
                  void el.play().catch(() => setBuffering(false));
                  return;
                }

                // Passo 3: abre no player incorporado em segundo plano se aplicável
                if (fallbackAttemptRef.current < 3) {
                  fallbackAttemptRef.current = 3;
                  if (activateIframeFallback()) {
                    return;
                  }
                }

                setBuffering(false);
              }}
              className="w-full h-full max-h-[82vh] object-contain cursor-pointer"
            />

            {!playing && !buffering && sourceReady && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Reproduzir"
                className="absolute z-10 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-transform hover:scale-105 cursor-pointer"
                style={{ backgroundColor: settings.primaryColor }}
              >
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </button>
            )}

            {autoMutedNotice && muted && playing && (
              <button
                type="button"
                onClick={toggleMute}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 border border-white/20 text-xs font-medium text-white hover:bg-black cursor-pointer"
              >
                <VolumeX className="w-3.5 h-3.5 text-red-400" />
                Toque para ativar som
              </button>
            )}
          </>
        )}

        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Controlos compactos */}
      <div className="relative z-20 px-4 py-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent space-y-2.5">
        {!isLiveStream && !embedUrl && (
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-zinc-300 tabular-nums w-10">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Number.isFinite(duration) && duration > 0 ? duration : 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 accent-[#E50914] cursor-pointer"
            />
            <span className="text-[11px] text-zinc-400 tabular-nums w-10 text-right">
              {formatTime(duration)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!embedUrl && (
              <>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {playing ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span className="hidden sm:inline">{playing ? 'Pausa' : 'Play'}</span>
                </button>

                {!isLiveStream && (
                  <>
                    <button
                      type="button"
                      onClick={() => skipSeconds(-10)}
                      aria-label="-10s"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>10s</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => skipSeconds(10)}
                      aria-label="+10s"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>10s</span>
                    </button>
                  </>
                )}
              </>
            )}

            {nextEpisode && (
              <button
                type="button"
                onClick={() => setActiveEpisodeId(nextEpisode.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/15 hover:bg-white/25 text-[11px] font-medium text-white cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Próximo</span>
              </button>
            )}

            {!embedUrl && (
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Som' : 'Mudo'}
                className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 relative">
            {episodes.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setEpisodeMenuOpen((prev) => !prev);
                    setQualityMenuOpen(false);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white cursor-pointer"
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  <span>Episódios</span>
                </button>
                {episodeMenuOpen && (
                  <div className="absolute right-0 bottom-9 w-64 max-h-60 overflow-y-auto bg-[#141418] border border-white/15 rounded shadow-xl p-1 z-30 space-y-0.5">
                    {episodes.map((ep) => {
                      const isCurrent = ep.id === currentEpisode?.id;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => {
                            setActiveEpisodeId(ep.id);
                            setEpisodeMenuOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded transition-colors cursor-pointer ${
                            isCurrent ? 'text-white font-semibold' : 'text-zinc-300 hover:bg-white/10'
                          }`}
                          style={isCurrent ? { backgroundColor: settings.primaryColor } : undefined}
                        >
                          T{ep.season} E{ep.episodeNumber} · {ep.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!embedUrl && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setQualityMenuOpen((prev) => !prev);
                    setEpisodeMenuOpen(false);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>{quality}</span>
                </button>
                {qualityMenuOpen && (
                  <div className="absolute right-0 bottom-9 w-28 bg-[#141418] border border-white/15 rounded shadow-xl p-1 z-30">
                    {hlsLevels.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectHlsLevel(-1, 'Auto')}
                          className={`w-full text-left px-2.5 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                            activeHlsLevel === -1 ? 'text-white' : 'text-zinc-300 hover:bg-white/10'
                          }`}
                          style={
                            activeHlsLevel === -1
                              ? { backgroundColor: settings.primaryColor }
                              : undefined
                          }
                        >
                          Auto
                        </button>
                        {hlsLevels.map((lvl) => (
                          <button
                            key={lvl.index}
                            type="button"
                            onClick={() => handleSelectHlsLevel(lvl.index, lvl.label)}
                            className={`w-full text-left px-2.5 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                              activeHlsLevel === lvl.index
                                ? 'text-white'
                                : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            style={
                              activeHlsLevel === lvl.index
                                ? { backgroundColor: settings.primaryColor }
                                : undefined
                            }
                          >
                            {lvl.label}
                          </button>
                        ))}
                      </>
                    ) : (
                      (['Auto', '1080p', '720p', '480p'] as QualityOption[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => {
                            setQuality(q);
                            setQualityMenuOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                            quality === q ? 'text-white' : 'text-zinc-300 hover:bg-white/10'
                          }`}
                          style={quality === q ? { backgroundColor: settings.primaryColor } : undefined}
                        >
                          {q}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Ecrã inteiro"
              className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5" />
              ) : (
                <Maximize className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
