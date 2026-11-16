import React, { useEffect, useRef, useState } from 'react';
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
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SeriesEpisodeSource, VideoItem, VideoSource } from '../types/mozflix';

interface VideoPlayerModalProps {
  video: VideoItem | null;
  initialEpisodeId?: string | null;
  offlineBlobUrl?: string | null;
  onClose: () => void;
}

type QualityOption = 'Auto' | '1080p' | '720p' | '480p';

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

  const [episodes, setEpisodes] = useState<SeriesEpisodeSource[]>([]);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(initialEpisodeId || null);
  const [episodeMenuOpen, setEpisodeMenuOpen] = useState(false);

  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [quality, setQuality] = useState<QualityOption>('Auto');
  const [hlsLevels, setHlsLevels] = useState<{ index: number; label: string }[]>([]);
  const [activeHlsLevel, setActiveHlsLevel] = useState<number>(-1);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const canPlayCurrentVideo = Boolean(video && (offlineBlobUrl || canWatchVideo(video)));

  useEffect(() => {
    setActiveEpisodeId(initialEpisodeId || null);
    setEpisodeMenuOpen(false);
  }, [video?.id, initialEpisodeId]);

  // Fechar imediatamente se bloqueado ou se o pacote expirar
  useEffect(() => {
    if (!video) return;
    if (profile?.isBlocked || !canPlayCurrentVideo) {
      onClose();
    }
  }, [video, profile?.isBlocked, canPlayCurrentVideo, onClose]);

  // Buscar link e episódios no cofre videoSources em segundo plano — zero links visíveis na interface
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;

    let cancelled = false;
    setPlaybackError(null);
    setBuffering(true);
    setIsLiveStream(false);
    setHlsLevels([]);
    setActiveHlsLevel(-1);

    const cleanupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const attachStream = async () => {
      cleanupHls();

      let streamTarget = offlineBlobUrl || '';
      let resolvedEpisodes: SeriesEpisodeSource[] = [];

      if (!streamTarget) {
        try {
          const sourceSnap = await getDoc(doc(db, 'videoSources', video.id));
          if (cancelled) return;
          if (sourceSnap.exists()) {
            const srcData = sourceSnap.data() as VideoSource;
            resolvedEpisodes = Array.isArray(srcData.episodes)
              ? [...srcData.episodes].sort(
                  (a, b) => a.season - b.season || a.episodeNumber - b.episodeNumber
                )
              : [];
            setEpisodes(resolvedEpisodes);

            if (resolvedEpisodes.length > 0) {
              const chosen =
                (activeEpisodeId && resolvedEpisodes.find((e) => e.id === activeEpisodeId)) ||
                resolvedEpisodes[0];
              if (!activeEpisodeId && chosen) {
                setActiveEpisodeId(chosen.id);
              }
              streamTarget = chosen?.videoUrl || srcData.videoUrl || '';
            } else {
              streamTarget = srcData.videoUrl || '';
            }
          } else {
            setEpisodes([]);
            streamTarget = video.videoUrl || '';
          }
        } catch {
          if (!cancelled) {
            setBuffering(false);
            setPlaybackError('Pacote expirado ou acesso negado.');
          }
          return;
        }
      } else {
        setEpisodes([]);
      }

      if (!streamTarget) {
        if (!cancelled) {
          setBuffering(false);
          setPlaybackError('Stream indisponível.');
        }
        return;
      }

      const lower = streamTarget.toLowerCase();
      const isHls = lower.includes('.m3u8');
      if (isHls) {
        setIsLiveStream(video.category === 'Canal');
      }

      if (isHls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: video.category === 'Canal',
        });
        hlsRef.current = hls;
        hls.loadSource(streamTarget);
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
          void el.play().catch(() => {
            if (!cancelled) setPlaying(false);
          });
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal || cancelled) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setBuffering(false);
            setPlaybackError('Canal ou stream offline de momento.');
            cleanupHls();
          }
        });
      } else {
        el.src = streamTarget;
        el.load();
        void el.play().catch(() => {
          if (!cancelled) setPlaying(false);
        });
      }
    };

    void attachStream();

    return () => {
      cancelled = true;
      cleanupHls();
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [video, activeEpisodeId, offlineBlobUrl]);

  // Registar visualização + sessão em tempo real
  useEffect(() => {
    if (!video || !firebaseUser || !navigator.onLine) return;

    const registerView = async () => {
      try {
        await updateDoc(doc(db, 'videos', video.id), {
          views: increment(1),
        });
      } catch {
        // Ignorar erro transitório
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
        // Ignorar erro de sessão
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

  const activeEpIdx = episodes.findIndex((e) => e.id === activeEpisodeId);
  const currentEpisode = activeEpIdx >= 0 ? episodes[activeEpIdx] : episodes[0] || null;
  const nextEpisode =
    activeEpIdx >= 0 && activeEpIdx + 1 < episodes.length ? episodes[activeEpIdx + 1] : null;

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const skipSeconds = (delta: number) => {
    const el = videoRef.current;
    if (!el || isLiveStream) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = videoRef.current;
    if (!el || isLiveStream) return;
    const target = Number(e.target.value);
    el.currentTime = target;
    setCurrentTime(target);
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
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
      {/* Top bar — título e episódio, zero links e sem marca d'água */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/85 to-transparent">
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

      {/* Superfície de vídeo livre para gravação de ecrã e reprodução fluida */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          controls={false}
          playsInline
          onClick={togglePlay}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => {
            setBuffering(false);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onError={() => {
            setBuffering(false);
            setPlaybackError('Stream indisponível. Contacta o suporte.');
          }}
          className="w-full h-full max-h-[82vh] object-contain cursor-pointer"
        />

        {buffering && !playbackError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
        )}

        {playbackError && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-[#141418] border border-white/15 rounded-md px-4 py-3 text-xs text-red-300">
              {playbackError}
            </div>
          </div>
        )}
      </div>

      {/* Controlos compactos */}
      <div className="relative z-10 px-4 py-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent space-y-2.5">
        {!isLiveStream && (
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

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Som' : 'Mudo'}
              className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
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
