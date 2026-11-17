import React, { useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import {
  Check,
  Copy,
  Edit2,
  Film,
  KeyRound,
  Link2,
  Plus,
  Search,
  Shield,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db, storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  SeriesEpisodeMeta,
  SeriesEpisodeSource,
  VideoCategory,
  VideoItem,
  VideoSource,
} from '../../types/mozflix';
import { adminGeneratePins, logAdminAction } from '../../utils/adminActions';
import { formatCurrencyMt, getMillis } from '../../utils/formatters';
import {
  isValidHttpUrl,
  normalizeStreamUrl,
  uploadCoverWithFallback,
} from '../../utils/mediaUpload';
import { sanitizeUserError } from '../../utils/errorSanitizer';

interface AdminVideosProps {
  videos: VideoItem[];
}

interface VideoFormState {
  id?: string;
  title: string;
  description: string;
  category: VideoCategory;
  coverUrl: string;
  videoUrl: string;
  coverStoragePath?: string;
  videoStoragePath?: string;
  duration: string;
  individualPriceMt: number;
  isFreeTrailer: boolean;
  active: boolean;
  featured: boolean;
  episodes: SeriesEpisodeSource[];
}

const EMPTY_FORM: VideoFormState = {
  title: '',
  description: '',
  category: 'Filme',
  coverUrl: '',
  videoUrl: '',
  duration: '1h 45m',
  individualPriceMt: 5,
  isFreeTrailer: false,
  active: true,
  featured: false,
  episodes: [],
};

interface EpisodeDraft {
  id?: string;
  season: number;
  episodeNumber: number;
  title: string;
  duration: string;
  videoUrl: string;
}

const EMPTY_EPISODE_DRAFT: EpisodeDraft = {
  season: 1,
  episodeNumber: 1,
  title: '',
  duration: '45m',
  videoUrl: '',
};

export function AdminVideos({ videos }: AdminVideosProps) {
  const { profile, settings } = useAuth();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [quickLinkVideo, setQuickLinkVideo] = useState<VideoItem | null>(null);
  const [quickLinkUrl, setQuickLinkUrl] = useState('');
  const [quickPinVideo, setQuickPinVideo] = useState<VideoItem | null>(null);
  const [pinHours, setPinHours] = useState(24);
  const [pinPrice, setPinPrice] = useState(5);
  const [pinQty, setPinQty] = useState(1);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [loadingSource, setLoadingSource] = useState(false);
  const [form, setForm] = useState<VideoFormState>(EMPTY_FORM);
  const [epDraft, setEpDraft] = useState<EpisodeDraft>(EMPTY_EPISODE_DRAFT);
  const [epError, setEpError] = useState<string | null>(null);
  const [coverProgress, setCoverProgress] = useState<number | null>(null);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const sorted = [...videos].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (v) => v.title.toLowerCase().includes(q) || v.category.toLowerCase().includes(q)
    );
  }, [videos, search]);

  const fetchStreamLink = async (
    v: VideoItem
  ): Promise<{
    videoUrl: string;
    videoStoragePath: string;
    episodes: SeriesEpisodeSource[];
  }> => {
    try {
      const snap = await getDoc(doc(db, 'videoSources', v.id));
      if (snap.exists()) {
        const data = snap.data() as VideoSource;
        return {
          videoUrl: data.videoUrl || v.videoUrl || '',
          videoStoragePath: data.videoStoragePath || v.videoStoragePath || '',
          episodes: Array.isArray(data.episodes) ? data.episodes : [],
        };
      }
    } catch {
      // fallback para campo legado
    }
    return {
      videoUrl: v.videoUrl || '',
      videoStoragePath: v.videoStoragePath || '',
      episodes: [],
    };
  };

  const resetEpDraftForList = (episodes: SeriesEpisodeSource[], season = 1) => {
    const sameSeason = episodes.filter((e) => e.season === season);
    const nextEp =
      sameSeason.length > 0
        ? Math.max(...sameSeason.map((e) => e.episodeNumber)) + 1
        : 1;
    setEpDraft({
      season,
      episodeNumber: nextEp,
      title: `Episódio ${nextEp}`,
      duration: '45m',
      videoUrl: '',
    });
    setEpError(null);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    resetEpDraftForList([], 1);
    setCoverProgress(null);
    setCoverNotice(null);
    setVideoProgress(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = async (v: VideoItem) => {
    setForm({
      id: v.id,
      title: v.title,
      description: v.description,
      category: v.category,
      coverUrl: v.coverUrl,
      videoUrl: v.videoUrl || '',
      coverStoragePath: v.coverStoragePath,
      videoStoragePath: v.videoStoragePath,
      duration: v.duration,
      individualPriceMt: v.individualPriceMt ?? 5,
      isFreeTrailer: v.isFreeTrailer,
      active: v.active,
      featured: Boolean(v.featured),
      episodes: (v.episodesMeta || []).map((ep) => ({ ...ep, videoUrl: '' })),
    });
    setCoverProgress(null);
    setCoverNotice(null);
    setVideoProgress(null);
    setError(null);
    setModalOpen(true);

    setLoadingSource(true);
    const src = await fetchStreamLink(v);
    setForm((prev) => {
      if (prev.id !== v.id) return prev;
      const mergedEpisodes =
        src.episodes.length > 0
          ? src.episodes
          : (v.episodesMeta || []).map((m, idx) => ({
              ...m,
              videoUrl: idx === 0 ? src.videoUrl : '',
            }));
      resetEpDraftForList(mergedEpisodes, 1);
      return {
        ...prev,
        videoUrl: src.videoUrl,
        videoStoragePath: src.videoStoragePath,
        episodes: mergedEpisodes,
      };
    });
    setLoadingSource(false);
  };

  const handleAddOrUpdateEpisode = () => {
    setEpError(null);
    const normalized = normalizeStreamUrl(epDraft.videoUrl);
    if (!normalized || !isValidHttpUrl(normalized)) {
      setEpError('Link do episódio inválido. Usa https:// ou http://');
      return;
    }

    const season = Math.max(1, Number(epDraft.season || 1));
    const episodeNumber = Math.max(1, Number(epDraft.episodeNumber || 1));
    const title = epDraft.title.trim() || `Episódio ${episodeNumber}`;
    const duration = epDraft.duration.trim() || '45m';
    const epId = epDraft.id || `s${season}e${episodeNumber}-${Date.now().toString(36)}`;

    const nextEntry: SeriesEpisodeSource = {
      id: epId,
      season,
      episodeNumber,
      title,
      duration,
      videoUrl: normalized,
    };

    setForm((prev) => {
      const filteredList = prev.episodes.filter((e) => e.id !== epId);
      const updated = [...filteredList, nextEntry].sort(
        (a, b) => a.season - b.season || a.episodeNumber - b.episodeNumber
      );
      resetEpDraftForList(updated, season);
      return {
        ...prev,
        episodes: updated,
        videoUrl: updated[0]?.videoUrl || prev.videoUrl,
      };
    });
  };

  const handleEditEpisode = (ep: SeriesEpisodeSource) => {
    setEpDraft({
      id: ep.id,
      season: ep.season,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      duration: ep.duration,
      videoUrl: ep.videoUrl,
    });
    setEpError(null);
  };

  const handleRemoveEpisode = (epId: string) => {
    setForm((prev) => {
      const updated = prev.episodes.filter((e) => e.id !== epId);
      return {
        ...prev,
        episodes: updated,
        videoUrl: updated[0]?.videoUrl || prev.videoUrl,
      };
    });
  };

  const openQuickLink = async (v: VideoItem) => {
    setQuickLinkVideo(v);
    setQuickLinkUrl(v.videoUrl || '');
    setError(null);
    setLoadingSource(true);
    const src = await fetchStreamLink(v);
    setQuickLinkUrl(src.videoUrl);
    setLoadingSource(false);
  };

  const openQuickPin = (v: VideoItem) => {
    setQuickPinVideo(v);
    setPinHours(24);
    setPinPrice(v.individualPriceMt ?? 5);
    setPinQty(1);
    setGeneratedCodes([]);
    setError(null);
  };

  const handleGenerateContentPins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPinVideo) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminGeneratePins({
        targetType: 'content',
        packageId: null,
        packageName: quickPinVideo.title,
        includeAllContent: false,
        videoIds: [quickPinVideo.id],
        videoTitles: [quickPinVideo.title],
        duracaoHoras: pinHours,
        precoMt: pinPrice,
        quantidade: pinQty,
        prefixo: 'MOZ-',
        adminUid: profile?.uid || 'admin',
        adminEmail: profile?.email || 'admin',
      });
      setGeneratedCodes(res.codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar PIN.');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(null), 1500);
  };

  const handleUploadCover = async (file: File) => {
    setError(null);
    setCoverNotice(null);
    setCoverProgress(5);
    try {
      const result = await uploadCoverWithFallback(file, (pct) => setCoverProgress(pct));
      setForm((prev) => ({
        ...prev,
        coverUrl: result.url,
        coverStoragePath: result.storagePath,
      }));
      setCoverNotice(
        result.mode === 'storage' ? 'Capa guardada.' : 'Capa otimizada e aplicada.'
      );
    } catch (err) {
      setCoverProgress(null);
      setError(sanitizeUserError(err, 'Erro ao processar capa.'));
    }
  };

  const handleUploadVideoFile = (file: File, target: 'main' | 'episode' = 'main') => {
    setError(null);
    setVideoProgress(1);
    const cleanName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = `videos/${cleanName}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    let stalled = false;
    const stallTimer = window.setTimeout(() => {
      stalled = true;
      try {
        task.cancel();
      } catch {
        // ignore
      }
      setVideoProgress(null);
      setError('Não foi possível enviar o ficheiro. Cola o link direto abaixo.');
    }, 10000);

    task.on(
      'state_changed',
      (snap) => {
        if (snap.bytesTransferred > 0) {
          window.clearTimeout(stallTimer);
        }
        const pct = Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 100);
        setVideoProgress(Math.max(1, pct));
      },
      (err) => {
        window.clearTimeout(stallTimer);
        if (!stalled) {
          setVideoProgress(null);
          setError(sanitizeUserError(err, 'Não foi possível enviar o vídeo. Cola o link direto abaixo.'));
        }
      },
      async () => {
        window.clearTimeout(stallTimer);
        const url = await getDownloadURL(task.snapshot.ref);
        if (target === 'episode') {
          setEpDraft((prev) => ({ ...prev, videoUrl: url }));
        } else {
          setForm((prev) => ({
            ...prev,
            videoUrl: url,
            videoStoragePath: storagePath,
          }));
        }
        setVideoProgress(100);
      }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cover = form.coverUrl.trim();
    const isSeries = form.category === 'Série';
    const sortedEpisodes = [...form.episodes].sort(
      (a, b) => a.season - b.season || a.episodeNumber - b.episodeNumber
    );

    const primaryStream = isSeries
      ? normalizeStreamUrl(sortedEpisodes[0]?.videoUrl || form.videoUrl)
      : normalizeStreamUrl(form.videoUrl);

    if (!cover) {
      setError('A capa é obrigatória.');
      return;
    }

    if (isSeries && sortedEpisodes.length === 0 && !primaryStream) {
      setError('Adiciona pelo menos 1 episódio para a série.');
      return;
    }

    if (!primaryStream || !isValidHttpUrl(primaryStream)) {
      setError('Link de stream inválido. Usa http:// ou https://');
      return;
    }

    if (isSeries && sortedEpisodes.some((ep) => !isValidHttpUrl(normalizeStreamUrl(ep.videoUrl)))) {
      setError('Todos os episódios devem ter um link válido.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const videoRef = form.id ? doc(db, 'videos', form.id) : doc(collection(db, 'videos'));
      const sourceRef = doc(db, 'videoSources', videoRef.id);
      const batch = writeBatch(db);

      const episodesMeta: SeriesEpisodeMeta[] = isSeries
        ? sortedEpisodes.map(({ id, season, episodeNumber, title, duration }) => ({
            id,
            season,
            episodeNumber,
            title,
            duration,
          }))
        : [];

      const publicPayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        coverUrl: cover,
        coverStoragePath: form.coverStoragePath || '',
        duration:
          isSeries && sortedEpisodes.length > 0
            ? `${sortedEpisodes.length} ep.`
            : form.duration.trim(),
        individualPriceMt: Number(form.individualPriceMt ?? 5),
        isFreeTrailer: form.isFreeTrailer,
        active: form.active,
        featured: form.featured,
        episodesMeta,
      };

      if (form.id) {
        batch.update(videoRef, {
          ...publicPayload,
          videoUrl: deleteField(),
        });
      } else {
        batch.set(videoRef, {
          ...publicPayload,
          views: 0,
          createdAt: serverTimestamp(),
        });
      }

      batch.set(
        sourceRef,
        {
          videoId: videoRef.id,
          videoUrl: primaryStream,
          videoStoragePath: form.videoStoragePath || '',
          episodes: isSeries
            ? sortedEpisodes.map((ep) => ({
                ...ep,
                videoUrl: normalizeStreamUrl(ep.videoUrl),
              }))
            : [],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();

      await logAdminAction(
        profile?.uid || 'admin',
        profile?.email || 'admin',
        form.id ? 'EDITAR_VIDEO' : 'ADICIONAR_VIDEO',
        `${form.id ? 'Editou' : 'Adicionou'} "${publicPayload.title}" (${publicPayload.category})`
      );
      setModalOpen(false);
    } catch (err) {
      setError(sanitizeUserError(err, 'Não foi possível guardar. Tenta novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuickLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLinkVideo) return;
    const normalized = normalizeStreamUrl(quickLinkUrl);
    if (!normalized || !isValidHttpUrl(normalized)) {
      setError('Link inválido. Usa https:// ou http://');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'videoSources', quickLinkVideo.id),
        {
          videoId: quickLinkVideo.id,
          videoUrl: normalized,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      batch.update(doc(db, 'videos', quickLinkVideo.id), {
        videoUrl: deleteField(),
      });
      await batch.commit();

      await logAdminAction(
        profile?.uid || 'admin',
        profile?.email || 'admin',
        'TROCAR_LINK',
        `Atualizou link secreto de "${quickLinkVideo.title}"`
      );
      setQuickLinkVideo(null);
    } catch (err) {
      setError(sanitizeUserError(err, 'Não foi possível atualizar o link. Tenta novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeatured = async (video: VideoItem) => {
    const next = !video.featured;
    await updateDoc(doc(db, 'videos', video.id), { featured: next });
    await logAdminAction(
      profile?.uid || 'admin',
      profile?.email || 'admin',
      next ? 'DESTAQUE_ON' : 'DESTAQUE_OFF',
      `${next ? 'Colocou em destaque' : 'Removeu destaque de'} "${video.title}"`
    );
  };

  const handleToggleActive = async (video: VideoItem) => {
    await updateDoc(doc(db, 'videos', video.id), { active: !video.active });
    await logAdminAction(
      profile?.uid || 'admin',
      profile?.email || 'admin',
      video.active ? 'DESATIVAR_VIDEO' : 'ATIVAR_VIDEO',
      `${video.active ? 'Desativou' : 'Ativou'} "${video.title}"`
    );
  };

  const handleDelete = async (video: VideoItem) => {
    if (!window.confirm(`Apagar "${video.title}"?`)) return;
    try {
      const src = await fetchStreamLink(video);
      if (src.videoStoragePath) {
        await deleteObject(ref(storage, src.videoStoragePath)).catch(() => undefined);
      }
      if (video.coverStoragePath) {
        await deleteObject(ref(storage, video.coverStoragePath)).catch(() => undefined);
      }
      await deleteDoc(doc(db, 'videoSources', video.id)).catch(() => undefined);
      await deleteDoc(doc(db, 'videos', video.id));
      await logAdminAction(
        profile?.uid || 'admin',
        profile?.email || 'admin',
        'APAGAR_VIDEO',
        `Apagou "${video.title}"`
      );
    } catch (err) {
      setError(sanitizeUserError(err, 'Não foi possível apagar. Tenta novamente.'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Catálogo</h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30 text-[10px] font-medium text-emerald-300">
            <Shield className="w-3 h-3" />
            Links Ocultos
          </span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          style={{ backgroundColor: settings.primaryColor }}
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar..."
          className="w-full pl-9 pr-3 py-2 bg-[#141418] border border-white/15 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
        />
      </div>

      {error && !modalOpen && !quickLinkVideo && !quickPinVideo && (
        <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="bg-[#141418] border border-white/10 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A0A0C] text-zinc-400 border-b border-white/10">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Título</th>
                <th className="px-3.5 py-2.5 font-medium">Categoria</th>
                <th className="px-3.5 py-2.5 font-medium">Duração</th>
                <th className="px-3.5 py-2.5 font-medium">Preço</th>
                <th className="px-3.5 py-2.5 font-medium text-right">Views</th>
                <th className="px-3.5 py-2.5 font-medium">Estado</th>
                <th className="px-3.5 py-2.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-8 text-center text-zinc-500">
                    Nenhum título adicionado.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-white/[0.02]">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={v.coverUrl}
                          alt={v.title}
                          referrerPolicy="no-referrer"
                          className="w-8 h-11 object-cover rounded bg-[#1C1C22] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate max-w-[180px]">
                            {v.title}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {v.isFreeTrailer ? 'Grátis' : 'Pago'}
                            {v.featured ? ' · Destaque' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-zinc-300">
                      {v.category}
                      {v.category === 'Série' && v.episodesMeta && v.episodesMeta.length > 0 && (
                        <span className="ml-1 text-[10px] text-zinc-400">
                          ({v.episodesMeta.length} ep.)
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-zinc-300 tabular-nums">{v.duration}</td>
                    <td className="px-3.5 py-2.5 text-zinc-300 tabular-nums">
                      {formatCurrencyMt(v.individualPriceMt)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-tabular text-white">
                      {v.views || 0}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`text-[11px] font-semibold ${
                          v.active ? 'text-emerald-400' : 'text-zinc-500'
                        }`}
                      >
                        {v.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleFeatured(v)}
                          title={v.featured ? 'Remover Destaque' : 'Colocar em Destaque'}
                          className={`p-1.5 rounded cursor-pointer transition-colors ${
                            v.featured
                              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                              : 'bg-white/10 text-zinc-400 hover:text-white hover:bg-white/15'
                          }`}
                        >
                          <Star className={`w-3 h-3 ${v.featured ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuickPin(v)}
                          title="Gerar Código PIN exclusivo"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-medium text-emerald-300 cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          PIN
                        </button>
                        <button
                          type="button"
                          onClick={() => void openQuickLink(v)}
                          title="Trocar Link"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white cursor-pointer"
                        >
                          <Link2 className="w-3 h-3" />
                          Link
                        </button>
                        <button
                          type="button"
                          onClick={() => void openEdit(v)}
                          title="Editar"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(v)}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] text-zinc-200 cursor-pointer"
                        >
                          {v.active ? 'Pausar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(v)}
                          title="Apagar"
                          className="p-1.5 rounded bg-red-950/60 hover:bg-red-900/70 text-red-200 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Gerar PIN Exclusivo para este Filme/Série/Canal */}
      {quickPinVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white truncate">
                PIN · {quickPinVideo.title}
              </h2>
              <button
                type="button"
                onClick={() => setQuickPinVideo(null)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleGenerateContentPins} className="p-4 space-y-3">
              {error && (
                <div className="p-2 rounded bg-red-950/60 border border-red-500/40 text-[11px] text-red-200">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] text-zinc-400">Horas</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={pinHours}
                    onChange={(e) => setPinHours(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-zinc-400">Preço (MT)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pinPrice}
                    onChange={(e) => setPinPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-zinc-400">Qtd</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={pinQty}
                    onChange={(e) => setPinQty(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>
              </div>

              {generatedCodes.length > 0 && (
                <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-500/30 space-y-1.5 max-h-40 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-emerald-300">
                    Código exclusivo criado (1 uso / 1 telemóvel):
                  </div>
                  {generatedCodes.map((c) => (
                    <div
                      key={c}
                      className="flex items-center justify-between gap-2 bg-[#0A0A0C] px-2.5 py-1.5 rounded"
                    >
                      <span className="font-mono-tabular text-xs font-bold text-white">{c}</span>
                      <button
                        type="button"
                        onClick={() => void copyCode(c)}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                      >
                        {copiedCode === c ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copiar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickPinVideo(null)}
                  className="px-3 py-1.5 rounded bg-white/10 text-xs text-white cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded text-xs font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {saving ? 'A gerar...' : 'Gerar PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Trocar Link Rápido */}
      {quickLinkVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white truncate">
                Trocar Link · {quickLinkVideo.title}
              </h2>
              <button
                type="button"
                onClick={() => setQuickLinkVideo(null)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveQuickLink} className="p-4 space-y-3">
              {error && (
                <div className="p-2 rounded bg-red-950/60 border border-red-500/40 text-[11px] text-red-200">
                  {error}
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-400">
                  Novo Link (MP4 / .m3u8 / CDN)
                </label>
                <input
                  type="url"
                  required
                  disabled={loadingSource}
                  value={quickLinkUrl}
                  onChange={(e) => setQuickLinkUrl(e.target.value)}
                  placeholder={loadingSource ? 'A carregar...' : 'https://...'}
                  className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickLinkVideo(null)}
                  className="px-3 py-1.5 rounded bg-white/10 text-xs text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || loadingSource}
                  className="px-4 py-1.5 rounded text-xs font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {saving ? 'A guardar...' : 'Atualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar / Editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-[#141418] border border-white/15 rounded-lg overflow-hidden shadow-2xl my-auto">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                {form.id ? 'Editar Título' : 'Novo Título'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 max-h-[82vh] overflow-y-auto">
              {error && (
                <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-400">Nome</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Nome do filme, série ou canal"
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-400">Sinopse</label>
                  <textarea
                    required
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Sinopse completa visível ao cliente"
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-400">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as VideoCategory })
                    }
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                  >
                    <option value="Filme">Filme</option>
                    <option value="Série">Série</option>
                    <option value="Canal">Canal</option>
                    <option value="Documentário">Documentário</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-400">Duração</label>
                  <input
                    type="text"
                    required
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                    placeholder="1h 45m ou Ao Vivo"
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-400">Preço (MT)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.individualPriceMt}
                    onChange={(e) =>
                      setForm({ ...form, individualPriceMt: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[#0A0A0C] border border-white/15 rounded text-xs text-white tabular-nums"
                  />
                </div>

                <div className="flex flex-col justify-center gap-1.5 pt-1">
                  <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isFreeTrailer}
                      onChange={(e) => setForm({ ...form, isFreeTrailer: e.target.checked })}
                      className="accent-[#E50914]"
                    />
                    Grátis (sem pacote)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="accent-[#E50914]"
                    />
                    Ativo
                  </label>
                  <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                      className="accent-[#E50914]"
                    />
                    Destaque no Banner Principal
                  </label>
                </div>
              </div>

              {/* Capa */}
              <div className="p-3 rounded bg-[#0A0A0C] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-zinc-400">Capa</span>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white cursor-pointer">
                    <Upload className="w-3 h-3" />
                    Upload Foto
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void handleUploadCover(f);
                      }}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-16 rounded bg-[#141418] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {form.coverUrl ? (
                      <img
                        src={form.coverUrl}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5 min-w-0">
                    <input
                      type="text"
                      required={!form.coverUrl}
                      value={form.coverUrl.startsWith('data:image') ? '' : form.coverUrl}
                      onChange={(e) => {
                        setCoverNotice(null);
                        setForm({ ...form, coverUrl: e.target.value, coverStoragePath: '' });
                      }}
                      placeholder={
                        form.coverUrl.startsWith('data:image')
                          ? 'Capa carregada e comprimida'
                          : 'Ou cola o link da capa (https://...)'
                      }
                      className="w-full px-2.5 py-1.5 bg-[#141418] border border-white/10 rounded text-xs text-white"
                    />

                    {coverProgress !== null && coverProgress < 100 && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-white/10 rounded overflow-hidden">
                          <div
                            className="h-full transition-all duration-150"
                            style={{
                              width: `${coverProgress}%`,
                              backgroundColor: settings.primaryColor,
                            }}
                          />
                        </div>
                        <div className="text-[10px] text-amber-400 tabular-nums">
                          A processar... {coverProgress}%
                        </div>
                      </div>
                    )}

                    {coverNotice && (
                      <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                        <Check className="w-3 h-3" />
                        <span>{coverNotice}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stream Secreto ou Episódios da Série */}
              {form.category === 'Série' ? (
                <div className="p-3 rounded bg-[#0A0A0C] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-white">
                      Episódios da Série ({form.episodes.length})
                    </span>
                    <label className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] font-medium text-white cursor-pointer">
                      <Upload className="w-3 h-3" />
                      Upload MP4
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) handleUploadVideoFile(f, 'episode');
                        }}
                      />
                    </label>
                  </div>

                  {videoProgress !== null && videoProgress < 100 && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-white/10 rounded overflow-hidden">
                        <div
                          className="h-full transition-all duration-150"
                          style={{
                            width: `${videoProgress}%`,
                            backgroundColor: settings.primaryColor,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-amber-400 tabular-nums">{videoProgress}%</div>
                    </div>
                  )}

                  <div className="p-2.5 rounded bg-[#141418] border border-white/10 space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="space-y-0.5">
                        <label className="block text-[10px] text-zinc-400">Temp.</label>
                        <input
                          type="number"
                          min={1}
                          value={epDraft.season}
                          onChange={(e) =>
                            setEpDraft({ ...epDraft, season: Number(e.target.value) })
                          }
                          className="w-full px-2 py-1.5 bg-[#0A0A0C] border border-white/10 rounded text-xs text-white tabular-nums"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-[10px] text-zinc-400">Ep.</label>
                        <input
                          type="number"
                          min={1}
                          value={epDraft.episodeNumber}
                          onChange={(e) =>
                            setEpDraft({ ...epDraft, episodeNumber: Number(e.target.value) })
                          }
                          className="w-full px-2 py-1.5 bg-[#0A0A0C] border border-white/10 rounded text-xs text-white tabular-nums"
                        />
                      </div>
                      <div className="col-span-2 space-y-0.5">
                        <label className="block text-[10px] text-zinc-400">Duração</label>
                        <input
                          type="text"
                          value={epDraft.duration}
                          onChange={(e) => setEpDraft({ ...epDraft, duration: e.target.value })}
                          placeholder="45m"
                          className="w-full px-2 py-1.5 bg-[#0A0A0C] border border-white/10 rounded text-xs text-white"
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      value={epDraft.title}
                      onChange={(e) => setEpDraft({ ...epDraft, title: e.target.value })}
                      placeholder="Título do episódio (ex: O Início)"
                      className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/10 rounded text-xs text-white"
                    />

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={epDraft.videoUrl}
                        onChange={(e) => setEpDraft({ ...epDraft, videoUrl: e.target.value })}
                        placeholder="https://... link do episódio (.mp4 ou .m3u8)"
                        className="flex-1 px-2.5 py-1.5 bg-[#0A0A0C] border border-white/10 rounded text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddOrUpdateEpisode}
                        className="px-3 py-1.5 rounded text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                        style={{ backgroundColor: settings.primaryColor }}
                      >
                        {epDraft.id ? 'Atualizar Ep.' : '+ Episódio'}
                      </button>
                    </div>
                    {epError && <p className="text-[11px] text-red-300">{epError}</p>}
                  </div>

                  {form.episodes.length > 0 && (
                    <div className="max-h-44 overflow-y-auto divide-y divide-white/10 border border-white/10 rounded bg-[#141418]">
                      {form.episodes.map((ep) => (
                        <div
                          key={ep.id}
                          className="px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-white truncate">
                              T{ep.season} E{ep.episodeNumber} · {ep.title}
                            </div>
                            <div className="text-[10px] text-zinc-400 tabular-nums">
                              {ep.duration} · Link protegido
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditEpisode(ep)}
                              className="p-1 rounded bg-white/10 hover:bg-white/15 text-zinc-200 cursor-pointer"
                              title="Editar episódio"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEpisode(ep.id)}
                              className="p-1 rounded bg-red-950/60 hover:bg-red-900/70 text-red-200 cursor-pointer"
                              title="Remover episódio"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded bg-[#0A0A0C] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-zinc-400">
                      Link Stream (MP4 / .m3u8) — Oculto no cofre
                    </span>
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white cursor-pointer">
                      <Upload className="w-3 h-3" />
                      Upload MP4
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) handleUploadVideoFile(f, 'main');
                        }}
                      />
                    </label>
                  </div>
                  {videoProgress !== null && videoProgress < 100 && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-white/10 rounded overflow-hidden">
                        <div
                          className="h-full transition-all duration-150"
                          style={{
                            width: `${videoProgress}%`,
                            backgroundColor: settings.primaryColor,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-amber-400 tabular-nums">{videoProgress}%</div>
                    </div>
                  )}
                  <input
                    type="url"
                    required
                    disabled={loadingSource}
                    value={form.videoUrl}
                    onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                    placeholder={loadingSource ? 'A carregar link...' : 'https://... (.mp4 ou .m3u8)'}
                    className="w-full px-2.5 py-1.5 bg-[#141418] border border-white/10 rounded text-xs text-white"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 rounded bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || loadingSource}
                  className="px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {saving ? 'A guardar...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
