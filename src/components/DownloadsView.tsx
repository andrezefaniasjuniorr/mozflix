import { useEffect, useState } from 'react';
import { HardDrive, Play, Trash2 } from 'lucide-react';
import { OfflineDownload, VideoItem } from '../types/mozflix';
import { useAuth } from '../contexts/AuthContext';
import {
  deleteOfflineDownload,
  getOfflineVideoUrl,
  listOfflineDownloads,
} from '../utils/offlineStorage';
import { formatBytes, formatDateMz } from '../utils/formatters';

interface DownloadsViewProps {
  onPlayOffline: (video: VideoItem, blobUrl: string) => void;
}

export function DownloadsView({ onPlayOffline }: DownloadsViewProps) {
  const { settings, profile } = useAuth();
  const [downloads, setDownloads] = useState<OfflineDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDownloads = async () => {
    setLoading(true);
    try {
      const items = await listOfflineDownloads();
      setDownloads(items);
    } catch {
      setError('Erro ao carregar downloads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDownloads();
  }, []);

  if (!settings.downloadsEnabled) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-1">
        <h1 className="font-display text-2xl font-bold text-white">Downloads Desativados</h1>
      </div>
    );
  }

  if (profile?.isBlocked) {
    return null;
  }

  const handlePlay = async (item: OfflineDownload) => {
    setError(null);
    const blobUrl = await getOfflineVideoUrl(item.videoId);
    if (!blobUrl) {
      setError('Ficheiro offline indisponível.');
      return;
    }
    const videoObj: VideoItem = {
      id: item.videoId,
      title: item.title,
      description: item.description,
      category: item.category,
      coverUrl: item.coverUrl,
      videoUrl: blobUrl,
      duration: item.duration,
      individualPriceMt: 0,
      isFreeTrailer: true,
      active: true,
      views: 0,
    };
    onPlayOffline(videoObj, blobUrl);
  };

  const handleDelete = async (videoId: string) => {
    await deleteOfflineDownload(videoId);
    await loadDownloads();
  };

  const totalBytes = downloads.reduce((acc, d) => acc + d.sizeBytes, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-20">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h1 className="font-display text-2xl font-extrabold text-white">Meus Downloads</h1>
        <div className="inline-flex items-center gap-1.5 text-xs text-zinc-400 tabular-nums">
          <HardDrive className="w-3.5 h-3.5" />
          <span>
            {downloads.length} · {formatBytes(totalBytes)}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2].map((n) => (
            <div key={n} className="h-16 rounded-md bg-[#141418] animate-pulse" />
          ))}
        </div>
      ) : downloads.length === 0 ? (
        <div className="p-8 bg-[#141418] border border-white/10 rounded-md text-center space-y-1">
          <p className="text-sm font-medium text-white">Sem downloads</p>
          <p className="text-xs text-zinc-400">Os vídeos guardados para offline aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {downloads.map((item) => (
            <div
              key={item.videoId}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#141418] border border-white/10 rounded-md"
            >
              <div className="flex items-center gap-3">
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-12 h-16 object-cover rounded bg-[#1C1C22] shrink-0"
                />
                <div>
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <p className="text-[11px] text-zinc-400 tabular-nums">
                    {item.category} · {item.duration} · {formatBytes(item.sizeBytes)} ·{' '}
                    {formatDateMz(item.downloadedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePlay(item)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Assistir
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.videoId)}
                  aria-label={`Apagar ${item.title}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-red-950/60 hover:text-red-300 text-xs text-zinc-300 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
