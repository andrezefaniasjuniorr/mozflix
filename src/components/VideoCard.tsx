import { useState } from 'react';
import { Film, Lock, Play } from 'lucide-react';
import { VideoItem } from '../types/mozflix';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyMt } from '../utils/formatters';

interface VideoCardProps {
  video: VideoItem;
  fullWidth?: boolean;
  onSelect: (video: VideoItem) => void;
  onPlay: (video: VideoItem) => void;
}

export function VideoCard({ video, fullWidth = false, onSelect, onPlay }: VideoCardProps) {
  const { settings, canWatchVideo } = useAuth();
  const [imgError, setImgError] = useState(false);

  const canWatch = canWatchVideo(video);
  const priceLabel = video.isFreeTrailer
    ? 'Grátis'
    : canWatch
      ? 'Liberado'
      : formatCurrencyMt(video.individualPriceMt ?? 5);

  return (
    <article
      className={`group flex flex-col bg-[#141418] border border-white/10 rounded-md overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:border-white/25 ${
        fullWidth ? 'w-full' : 'shrink-0 w-[148px] sm:w-[172px] md:w-[188px]'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(video)}
        className="relative aspect-[3/4] w-full overflow-hidden bg-[#1C1C22] text-left cursor-pointer"
      >
        {!imgError && video.coverUrl ? (
          <img
            src={video.coverUrl}
            alt={video.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-[#1C1C22] to-[#0A0A0C]">
            <Film className="w-5 h-5 text-zinc-500 mb-1.5" />
            <span className="text-[11px] font-medium text-zinc-400 line-clamp-2">{video.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
        </div>
        {video.category === 'Canal' && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-semibold text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            TV
          </div>
        )}
        {video.category === 'Série' && video.episodesMeta && video.episodesMeta.length > 0 && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-semibold text-white tabular-nums">
            {video.episodesMeta.length} ep.
          </div>
        )}
      </button>

      <div className="p-2.5 flex flex-col flex-1 justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect(video)}
          className="text-left w-full cursor-pointer space-y-1"
        >
          <h3 className="text-xs font-semibold text-white line-clamp-1 group-hover:text-zinc-200">
            {video.title}
          </h3>
          <div className="flex items-center gap-1 text-[11px] text-zinc-400 tabular-nums">
            <span>{video.duration}</span>
            <span aria-hidden="true">·</span>
            <span className={video.isFreeTrailer || canWatch ? 'text-emerald-400 font-medium' : 'text-zinc-300 font-medium'}>
              {priceLabel}
            </span>
          </div>
          {video.description && (
            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
              {video.description}
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={() => (canWatch ? onPlay(video) : onSelect(video))}
          className="w-full inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded text-[11px] font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: canWatch ? settings.primaryColor : '#27272A' }}
        >
          {canWatch ? (
            <>
              <Play className="w-3 h-3 fill-current" />
              Assistir
            </>
          ) : (
            <>
              <Lock className="w-3 h-3" />
              Ver / Comprar
            </>
          )}
        </button>
      </div>
    </article>
  );
}
