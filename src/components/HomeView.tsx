import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Info, Lock, Play, Star, Ticket } from 'lucide-react';
import { VideoCategory, VideoItem } from '../types/mozflix';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyMt } from '../utils/formatters';
import { VideoCard } from './VideoCard';

interface HomeViewProps {
  videos: VideoItem[];
  loadingVideos: boolean;
  searchQuery: string;
  onSelectVideo: (video: VideoItem) => void;
  onPlayVideo: (video: VideoItem) => void;
  onGoToPackages: () => void;
}

const CATEGORIES: { key: VideoCategory; label: string }[] = [
  { key: 'Filme', label: 'Filmes' },
  { key: 'Série', label: 'Séries' },
  { key: 'Canal', label: 'Canais' },
  { key: 'Documentário', label: 'Documentários' },
];

export function HomeView({
  videos,
  loadingVideos,
  searchQuery,
  onSelectVideo,
  onPlayVideo,
  onGoToPackages,
}: HomeViewProps) {
  const { hasActivePackage, unlockedVideosMap, settings, canWatchVideo } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<'all' | VideoCategory>('all');
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroImgError, setHeroImgError] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeCatalog = useMemo(() => {
    let base = videos.filter((v) => v.active);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q)
      );
    }
    return base;
  }, [videos, searchQuery]);

  // Destaques definidos pelo Administrador
  const adminFeaturedList = useMemo(
    () => activeCatalog.filter((v) => Boolean(v.featured)),
    [activeCatalog]
  );

  const featuredVideos = useMemo(() => {
    return adminFeaturedList.length > 0 ? adminFeaturedList : activeCatalog.slice(0, 1);
  }, [adminFeaturedList, activeCatalog]);

  const safeHeroIndex = featuredVideos.length > 0 ? heroIndex % featuredVideos.length : 0;
  const featuredVideo = featuredVideos[safeHeroIndex] || null;
  const canWatchHero = featuredVideo ? canWatchVideo(featuredVideo) : false;

  const hasAnyIndividualUnlock = Object.keys(unlockedVideosMap).length > 0;

  const scrollRow = (key: string, dir: 'left' | 'right') => {
    const el = rowRefs.current[key];
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -440 : 440, behavior: 'smooth' });
  };

  if (loadingVideos) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="h-[320px] rounded-md bg-[#141418] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="aspect-[3/4] rounded-md bg-[#141418] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const categoryItems =
    selectedCategory === 'all'
      ? activeCatalog
      : activeCatalog.filter((v) => v.category === selectedCategory);

  return (
    <div className="pb-20">
      {/* Banner em Destaque (controlado pelo Admin) */}
      {featuredVideo && !searchQuery.trim() && (
        <section className="relative h-[340px] sm:h-[430px] w-full overflow-hidden border-b border-white/10 bg-[#141418]">
          {!heroImgError && featuredVideo.coverUrl ? (
            <img
              key={featuredVideo.id}
              src={featuredVideo.coverUrl}
              alt={featuredVideo.title}
              referrerPolicy="no-referrer"
              onError={() => setHeroImgError(true)}
              className="w-full h-full object-cover scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1C1C22] via-[#121216] to-[#0A0A0C]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/70 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0C] via-[#0A0A0C]/70 to-transparent" />

          <div className="absolute inset-0 max-w-7xl mx-auto px-4 flex flex-col justify-end pb-7 sm:pb-10">
            <div className="max-w-xl space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-zinc-300 tabular-nums">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Em Destaque
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white">
                  {featuredVideo.category}
                </span>
                <span>{featuredVideo.duration}</span>
                <span aria-hidden="true">·</span>
                {featuredVideo.isFreeTrailer ? (
                  <span className="text-emerald-400 font-semibold">Grátis</span>
                ) : canWatchHero ? (
                  <span className="text-emerald-400 font-semibold">Liberado</span>
                ) : (
                  <span className="text-zinc-200 font-semibold">
                    {formatCurrencyMt(featuredVideo.individualPriceMt ?? 5)}
                  </span>
                )}
              </div>

              <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-white tracking-tight text-balance leading-[1.05]">
                {featuredVideo.title}
              </h1>

              {featuredVideo.description && (
                <p className="text-xs sm:text-sm text-zinc-200 line-clamp-3 leading-relaxed">
                  {featuredVideo.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onPlayVideo(featuredVideo)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {canWatchHero ? (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  {canWatchHero ? 'Assistir' : 'Desbloquear'}
                </button>

                <button
                  type="button"
                  onClick={() => onSelectVideo(featuredVideo)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-white/15 hover:bg-white/25 text-xs font-medium text-white backdrop-blur-sm transition-colors cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  Ler Sinopse
                </button>
              </div>
            </div>

            {featuredVideos.length > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {featuredVideos.map((fv, idx) => (
                    <button
                      key={fv.id}
                      type="button"
                      onClick={() => {
                        setHeroImgError(false);
                        setHeroIndex(idx);
                      }}
                      aria-label={`Destaque ${idx + 1}`}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === safeHeroIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setHeroImgError(false);
                      setHeroIndex(
                        (prev) => (prev - 1 + featuredVideos.length) % featuredVideos.length
                      );
                    }}
                    aria-label="Destaque anterior"
                    className="p-1.5 rounded bg-black/60 border border-white/15 text-white hover:bg-black cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeroImgError(false);
                      setHeroIndex((prev) => (prev + 1) % featuredVideos.length);
                    }}
                    aria-label="Seguinte destaque"
                    className="p-1.5 rounded bg-black/60 border border-white/15 text-white hover:bg-black cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Aviso compacto quando não tem pacote */}
      {!hasActivePackage && (
        <section className="max-w-7xl mx-auto px-4 mt-5">
          <div className="bg-[#141418] border border-white/10 rounded-md px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="font-display text-base font-bold text-white">
                {hasAnyIndividualUnlock ? 'Acesso individual ativo' : 'Sem pacote ativo'}
              </h2>
              <p className="text-xs text-zinc-400">
                Compra um título único ou ativa um pacote com código PIN.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToPackages}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Ticket className="w-3.5 h-3.5" />
              Pacotes &amp; PIN
            </button>
          </div>
        </section>
      )}

      {/* Filtro rápido por categoria */}
      {activeCatalog.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 mt-5">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide border-b border-white/10 pb-2.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'text-white'
                  : 'bg-[#141418] text-zinc-400 hover:text-white border border-white/10'
              }`}
              style={
                selectedCategory === 'all' ? { backgroundColor: settings.primaryColor } : undefined
              }
            >
              Todos
            </button>
            {CATEGORIES.map((cat) => {
              const count = activeCatalog.filter((v) => v.category === cat.key).length;
              if (count === 0) return null;
              const active = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'text-white'
                      : 'bg-[#141418] text-zinc-400 hover:text-white border border-white/10'
                  }`}
                  style={active ? { backgroundColor: settings.primaryColor } : undefined}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Catálogo Real */}
      <div className="max-w-7xl mx-auto px-4 mt-5 space-y-7">
        {activeCatalog.length === 0 ? (
          <div className="p-8 bg-[#141418] border border-white/10 rounded-md text-center space-y-2">
            <Film className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-sm font-medium text-white">
              {searchQuery.trim() ? 'Sem resultados' : 'Nenhum conteúdo publicado'}
            </p>
            <p className="text-xs text-zinc-400">
              {searchQuery.trim()
                ? 'Tenta outro termo.'
                : 'Aguarda os títulos do administrador.'}
            </p>
          </div>
        ) : selectedCategory !== 'all' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {categoryItems.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                fullWidth
                onSelect={onSelectVideo}
                onPlay={onPlayVideo}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Secção visível de Em Destaque quando o Admin marca títulos */}
            {!searchQuery.trim() && adminFeaturedList.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400 fill-current" />
                    <h2 className="font-display text-xl font-bold text-white tracking-tight">
                      Em Destaque
                    </h2>
                  </div>
                  {adminFeaturedList.length > 3 && (
                    <div className="hidden sm:flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => scrollRow('__featured', 'left')}
                        aria-label="Anterior em Destaque"
                        className="p-1 rounded bg-[#141418] border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollRow('__featured', 'right')}
                        aria-label="Seguinte em Destaque"
                        className="p-1 rounded bg-[#141418] border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div
                  ref={(el) => {
                    rowRefs.current['__featured'] = el;
                  }}
                  className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
                >
                  {adminFeaturedList.map((video) => (
                    <VideoCard
                      key={`feat-${video.id}`}
                      video={video}
                      onSelect={onSelectVideo}
                      onPlay={onPlayVideo}
                    />
                  ))}
                </div>
              </section>
            )}

            {CATEGORIES.map((cat) => {
              const items = activeCatalog.filter((v) => v.category === cat.key);
              if (items.length === 0) return null;
              return (
                <section key={cat.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-xl font-bold text-white tracking-tight">
                      {cat.label}
                    </h2>
                    <div className="hidden sm:flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => scrollRow(cat.key, 'left')}
                        aria-label={`Anterior em ${cat.label}`}
                        className="p-1 rounded bg-[#141418] border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollRow(cat.key, 'right')}
                        aria-label={`Seguinte em ${cat.label}`}
                        className="p-1 rounded bg-[#141418] border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div
                    ref={(el) => {
                      rowRefs.current[cat.key] = el;
                    }}
                    className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
                  >
                    {items.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onSelect={onSelectVideo}
                        onPlay={onPlayVideo}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
