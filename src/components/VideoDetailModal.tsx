import React, { useMemo, useState } from 'react';
import { Check, Download, Film, KeyRound, Lock, MessageCircle, Play, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SeriesEpisodeMeta, VideoItem, VideoSource } from '../types/mozflix';
import { useAuth } from '../contexts/AuthContext';
import { redeemPinCode } from '../utils/adminActions';
import { buildWhatsAppUrl, formatCurrencyMt } from '../utils/formatters';
import { saveVideoForOffline } from '../utils/offlineStorage';
import { sanitizeUserError } from '../utils/errorSanitizer';
import {
  encodeStreamProxyUrl,
  isStreamTunnelAvailable,
  resolveStreamTarget,
} from '../utils/streamResolver';

interface VideoDetailModalProps {
  video: VideoItem | null;
  onClose: () => void;
  onPlay: (video: VideoItem, episodeId?: string) => void;
  onGoToPackages: () => void;
  isDownloaded: boolean;
  downloadedIds?: Set<string>;
  onDownloadComplete: () => void;
}

export function VideoDetailModal({
  video,
  onClose,
  onPlay,
  onGoToPackages,
  isDownloaded,
  downloadedIds,
  onDownloadComplete,
}: VideoDetailModalProps) {
  const {
    firebaseUser,
    profile,
    settings,
    deviceId,
    serverNowMs,
    canWatchVideo,
    getVideoUnlockExpiresAt,
  } = useAuth();

  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const [pinCode, setPinCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);

  const episodes = useMemo(() => {
    if (!video?.episodesMeta) return [];
    return [...video.episodesMeta].sort(
      (a, b) => a.season - b.season || a.episodeNumber - b.episodeNumber
    );
  }, [video]);

  const seasons = useMemo(
    () => Array.from(new Set(episodes.map((e) => e.season))),
    [episodes]
  );

  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const activeSeason = seasons.includes(selectedSeason) ? selectedSeason : seasons[0] || 1;
  const seasonEpisodes = episodes.filter((e) => e.season === activeSeason);

  if (!video) return null;

  const isSeriesWithEpisodes = video.category === 'Série' && episodes.length > 0;
  const canWatch = canWatchVideo(video);
  const expiresAtMs = getVideoUnlockExpiresAt(video.id);
  const remainingHours =
    expiresAtMs && expiresAtMs > serverNowMs
      ? Math.max(1, Math.ceil((expiresAtMs - serverNowMs) / (1000 * 60 * 60)))
      : 0;
  const priceMt = video.individualPriceMt ?? 5;

  const waMessage = `Olá ${settings.appName}, quero comprar o código PIN para "${video.title}" (${video.category} · ${formatCurrencyMt(
    priceMt
  )}). Conta: ${profile?.phone || profile?.email || ''}`;

  const handleDownload = async (ep?: SeriesEpisodeMeta) => {
    if (!canWatch) {
      setDownloadErr('Desbloqueia o título primeiro.');
      return;
    }
    const key = ep ? `${video.id}::ep::${ep.id}` : video.id;
    setDownloadErr(null);
    setDownloadMsg(null);
    setDownloadingKey(key);
    setProgress(0);
    try {
      const sourceSnap = await getDoc(doc(db, 'videoSources', video.id));
      let streamUrl = '';
      if (sourceSnap.exists()) {
        const srcData = sourceSnap.data() as VideoSource;
        if (ep && Array.isArray(srcData.episodes)) {
          streamUrl = srcData.episodes.find((item) => item.id === ep.id)?.videoUrl || '';
        }
        if (!streamUrl) streamUrl = srcData.videoUrl || '';
      } else {
        streamUrl = video.videoUrl || '';
      }

      if (!streamUrl) {
        throw new Error('Link indisponível.');
      }

      const resolved = resolveStreamTarget(streamUrl);
      let downloadUrl = resolved ? resolved.url : streamUrl;
      if (resolved?.requiresTunnel && (await isStreamTunnelAvailable())) {
        downloadUrl = encodeStreamProxyUrl(resolved.url);
      }

      await saveVideoForOffline(
        video,
        downloadUrl,
        (pct) => setProgress(pct),
        ep
          ? {
              downloadId: key,
              titleOverride: `${video.title} · T${ep.season}E${ep.episodeNumber} - ${ep.title}`,
              durationOverride: ep.duration,
            }
          : undefined
      );
      setDownloadMsg('Guardado em Downloads.');
      onDownloadComplete();
    } catch (err) {
      setDownloadErr(sanitizeUserError(err, 'Não foi possível transferir.'));
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleRedeemPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const cleaned = pinCode.trim().toUpperCase();
    if (!cleaned) {
      setPinErr('Introduz o código PIN.');
      return;
    }

    setRedeeming(true);
    setPinErr(null);
    setPinMsg(null);
    try {
      const res = await redeemPinCode({
        codigo: cleaned,
        uid: firebaseUser.uid,
        userContact: profile?.phone || profile?.email || firebaseUser.uid,
        deviceId,
        serverNowMs,
      });
      setPinMsg(res.message);
      setPinCode('');
    } catch (err) {
      setPinErr(sanitizeUserError(err, 'Código inválido ou já utilizado.'));
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <div className="relative w-full max-w-2xl bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl my-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/75 border border-white/15 text-white hover:bg-black transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="relative h-56 sm:h-64 w-full bg-[#1C1C22]">
          {!imgError && video.coverUrl ? (
            <img
              src={video.coverUrl}
              alt={video.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-7 h-7 text-zinc-600" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-[#141418]/45 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {video.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-300 tabular-nums">
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-medium">
                {video.category}
              </span>
              <span aria-hidden="true">·</span>
              <span>{video.duration}</span>
              <span aria-hidden="true">·</span>
              <span className={video.isFreeTrailer ? 'text-emerald-400 font-medium' : 'font-medium text-white'}>
                {video.isFreeTrailer ? 'Grátis' : formatCurrencyMt(priceMt)}
              </span>
              {remainingHours > 0 && !video.isFreeTrailer && !profile?.isAdmin && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-semibold">
                    Ativo ({remainingHours}h restantes)
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Sinopse
            </div>
            <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
              {video.description?.trim() || 'Sem sinopse registada.'}
            </div>
          </div>

          {!canWatch && (
            <div className="p-3.5 rounded-md bg-[#0A0A0C] border border-white/15 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-200">
                  <Lock className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>
                    Compra este título por{' '}
                    <strong className="text-white tabular-nums">{formatCurrencyMt(priceMt)}</strong>{' '}
                    ou usa um pacote.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToPackages();
                  }}
                  className="text-[11px] font-semibold text-zinc-300 hover:text-white underline cursor-pointer"
                >
                  Ver Pacotes
                </button>
              </div>

              <a
                href={buildWhatsAppUrl(settings.supportWhatsapp, waMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Comprar no WhatsApp ({formatCurrencyMt(priceMt)})
              </a>

              <form onSubmit={handleRedeemPin} className="space-y-2 pt-1 border-t border-white/10">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <KeyRound className="w-3 h-3" />
                  <span>Já recebeste o código PIN?</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.toUpperCase())}
                    placeholder="MOZ-XXXXXXXX"
                    className="flex-1 px-3 py-1.5 bg-[#141418] border border-white/15 rounded font-mono-tabular text-xs text-white uppercase placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
                  />
                  <button
                    type="submit"
                    disabled={redeeming}
                    className="px-3.5 py-1.5 rounded text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60 cursor-pointer"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    {redeeming ? 'A ativar...' : 'Ativar PIN'}
                  </button>
                </div>
                {pinMsg && <p className="text-[11px] text-emerald-300 font-medium">{pinMsg}</p>}
                {pinErr && <p className="text-[11px] text-red-300">{pinErr}</p>}
              </form>
            </div>
          )}

          {pinMsg && canWatch && (
            <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
              {pinMsg}
            </div>
          )}

          {/* Lista de Temporadas e Episódios para Séries */}
          {isSeriesWithEpisodes && (
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">Episódios</span>
                {seasons.length > 1 && (
                  <div className="flex items-center gap-1">
                    {seasons.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSeason(s)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          activeSeason === s
                            ? 'text-white'
                            : 'bg-white/10 text-zinc-400 hover:text-white'
                        }`}
                        style={
                          activeSeason === s ? { backgroundColor: settings.primaryColor } : undefined
                        }
                      >
                        T{s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="divide-y divide-white/10 border border-white/10 rounded-md bg-[#0A0A0C]">
                {seasonEpisodes.map((ep) => {
                  const epDownloadKey = `${video.id}::ep::${ep.id}`;
                  const epIsDownloaded = downloadedIds?.has(epDownloadKey) ?? false;
                  const epIsDownloading = downloadingKey === epDownloadKey;

                  return (
                    <div
                      key={ep.id}
                      className="px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate">
                          T{ep.season} E{ep.episodeNumber} · {ep.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 tabular-nums">{ep.duration}</div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {settings.downloadsEnabled && canWatch && (
                          <button
                            type="button"
                            disabled={Boolean(downloadingKey)}
                            onClick={() => void handleDownload(ep)}
                            title="Baixar episódio offline"
                            className="p-1.5 rounded bg-white/10 hover:bg-white/15 text-zinc-200 disabled:opacity-50 cursor-pointer text-[10px] tabular-nums"
                          >
                            {epIsDownloaded ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : epIsDownloading ? (
                              <span>{progress}%</span>
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPlay(video, ep.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold text-white cursor-pointer"
                          style={{
                            backgroundColor: canWatch ? settings.primaryColor : '#27272A',
                          }}
                        >
                          {canWatch ? (
                            <Play className="w-3 h-3 fill-current" />
                          ) : (
                            <Lock className="w-3 h-3" />
                          )}
                          Assistir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {downloadMsg && (
            <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
              {downloadMsg}
            </div>
          )}
          {downloadErr && (
            <div className="p-2.5 rounded bg-red-950/40 border border-red-500/30 text-xs text-red-300">
              {downloadErr}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            {canWatch ? (
              <button
                type="button"
                onClick={() => onPlay(video, episodes[0]?.id)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: settings.primaryColor }}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isSeriesWithEpisodes ? 'Assistir Episódio 1' : 'Assistir Agora'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToPackages();
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Ver Pacotes
              </button>
            )}

            {settings.downloadsEnabled && video.category !== 'Canal' && !isSeriesWithEpisodes && (
              <button
                type="button"
                disabled={Boolean(downloadingKey) || !canWatch}
                onClick={() => void handleDownload()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-medium text-white disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isDownloaded ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Guardado
                  </>
                ) : downloadingKey === video.id ? (
                  <>{progress}%</>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Offline
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
