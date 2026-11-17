import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { Navbar, UserRoute } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { PackagesView } from './components/PackagesView';
import { DownloadsView } from './components/DownloadsView';
import { VideoDetailModal } from './components/VideoDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashLoader } from './components/SplashLoader';
import { AdminLoginScreen } from './components/admin/AdminLoginScreen';
import { AdminLayout, AdminTab } from './components/admin/AdminLayout';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminVideos } from './components/admin/AdminVideos';
import { AdminPackages } from './components/admin/AdminPackages';
import { AdminPins } from './components/admin/AdminPins';
import { AdminUsers } from './components/admin/AdminUsers';
import { AdminPayments } from './components/admin/AdminPayments';
import { AdminSettings } from './components/admin/AdminSettings';
import { AdminLogs } from './components/admin/AdminLogs';
import {
  AdminLog,
  AdminPackage,
  ManualPayment,
  PinCode,
  SecurityAlert,
  UserProfile,
  VideoItem,
} from './types/mozflix';
import { listOfflineDownloads } from './utils/offlineStorage';
import { readCachedVideos, saveCachedVideos } from './utils/localSnapshotCache';
import { getMillis } from './utils/formatters';

function AdminPortal({ onBackToUserApp }: { onBackToUserApp: () => void }) {
  const { firebaseUser, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [logsInitialSubTab, setLogsInitialSubTab] = useState<'admin' | 'security'>('admin');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [pins, setPins] = useState<PinCode[]>([]);
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);

  const isVerifiedAdmin = Boolean(firebaseUser && profile?.isAdmin && !profile?.isBlocked);

  useEffect(() => {
    if (!isVerifiedAdmin) return;

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setUsers(
          snap.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Omit<UserProfile, 'uid'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubVideos = onSnapshot(
      query(collection(db, 'videos'), orderBy('createdAt', 'desc')),
      (snap) => {
        setVideos(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<VideoItem, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'videos')
    );

    const unsubPackages = onSnapshot(
      query(collection(db, 'packages'), orderBy('createdAt', 'desc')),
      (snap) => {
        setPackages(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminPackage, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'packages')
    );

    const unsubPins = onSnapshot(
      query(collection(db, 'pins'), orderBy('criadoEm', 'desc')),
      (snap) => {
        setPins(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PinCode, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pins')
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'manualPayments'), orderBy('createdAt', 'desc')),
      (snap) => {
        setPayments(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ManualPayment, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'manualPayments')
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'adminLogs'), orderBy('createdAt', 'desc')),
      (snap) => {
        setLogs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminLog, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'adminLogs')
    );

    const unsubAlerts = onSnapshot(
      query(collection(db, 'securityAlerts'), orderBy('createdAt', 'desc')),
      (snap) => {
        setSecurityAlerts(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SecurityAlert, 'id'>),
          }))
        );
      },
      () => {
        setSecurityAlerts([]);
      }
    );

    return () => {
      unsubUsers();
      unsubVideos();
      unsubPackages();
      unsubPins();
      unsubPayments();
      unsubLogs();
      unsubAlerts();
    };
  }, [isVerifiedAdmin]);

  if (loading) {
    return <SplashLoader />;
  }

  if (!isVerifiedAdmin) {
    return <AdminLoginScreen onBackToUserApp={onBackToUserApp} />;
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      onSelectTab={(tab) => {
        if (tab === 'logs') setLogsInitialSubTab('admin');
        setActiveTab(tab);
      }}
      onBackToUserApp={onBackToUserApp}
    >
      {activeTab === 'dashboard' && (
        <AdminDashboard
          users={users}
          pins={pins}
          payments={payments}
          securityAlerts={securityAlerts}
          onOpenSecurityLogs={() => {
            setLogsInitialSubTab('security');
            setActiveTab('logs');
          }}
        />
      )}
      {activeTab === 'videos' && <AdminVideos videos={videos} />}
      {activeTab === 'packages' && <AdminPackages packages={packages} videos={videos} />}
      {activeTab === 'pins' && <AdminPins pins={pins} videos={videos} packages={packages} />}
      {activeTab === 'users' && <AdminUsers users={users} />}
      {activeTab === 'payments' && (
        <AdminPayments users={users} payments={payments} packages={packages} videos={videos} />
      )}
      {activeTab === 'settings' && <AdminSettings />}
      {activeTab === 'logs' && (
        <AdminLogs
          logs={logs}
          securityAlerts={securityAlerts}
          initialSubTab={logsInitialSubTab}
        />
      )}
    </AdminLayout>
  );
}

function UserApp({ onNavigateAdmin }: { onNavigateAdmin: () => void }) {
  const { firebaseUser, profile, loading, canWatchVideo } = useAuth();
  const [route, setRoute] = useState<UserRoute>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<VideoItem[]>(() => readCachedVideos());
  const [loadingVideos, setLoadingVideos] = useState(() => readCachedVideos().length === 0);
  const [detailVideo, setDetailVideo] = useState<VideoItem | null>(null);
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);
  const [playingEpisodeId, setPlayingEpisodeId] = useState<string | null>(null);
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const refreshDownloadedIds = async () => {
    try {
      const rows = await listOfflineDownloads();
      setDownloadedIds(new Set(rows.map((r) => r.videoId)));
    } catch {
      // Ignore IDB errors
    }
  };

  useEffect(() => {
    void refreshDownloadedIds();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    if (readCachedVideos().length === 0) {
      setLoadingVideos(true);
    }
    const videosSourceQuery = profile?.isAdmin
      ? collection(db, 'videos')
      : query(collection(db, 'videos'), where('active', '==', true));

    const unsub = onSnapshot(
      videosSourceQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<VideoItem, 'id'>),
          }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setVideos(list);
        saveCachedVideos(list.filter((v) => v.active));
        setLoadingVideos(false);
      },
      () => {
        // Offline or error: preserve cached snapshot without wiping catalog
        setLoadingVideos(false);
      }
    );
    return () => unsub();
  }, [firebaseUser, profile?.isAdmin]);

  if (loading) {
    return <SplashLoader />;
  }

  if (!firebaseUser || !profile) {
    return (
      <>
        <OfflineIndicator />
        <AuthScreen onNavigateAdmin={onNavigateAdmin} />
        <PWAInstallBanner />
        <WhatsAppFloatingButton />
      </>
    );
  }

  const handlePlayVideo = (video: VideoItem, episodeId?: string) => {
    if (!canWatchVideo(video)) {
      setDetailVideo(video);
      return;
    }

    setDetailVideo(null);
    setOfflineBlobUrl(null);
    setPlayingEpisodeId(episodeId || null);
    setPlayingVideo(video);
  };

  const handlePlayOffline = (video: VideoItem, blobUrl: string) => {
    setOfflineBlobUrl(blobUrl);
    setPlayingEpisodeId(null);
    setPlayingVideo(video);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7]">
      <OfflineIndicator />
      <Navbar
        activeRoute={route}
        onNavigate={setRoute}
        onNavigateAdmin={onNavigateAdmin}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {route === 'home' && (
        <HomeView
          videos={videos}
          loadingVideos={loadingVideos}
          searchQuery={searchQuery}
          onSelectVideo={setDetailVideo}
          onPlayVideo={handlePlayVideo}
          onGoToPackages={() => setRoute('packages')}
        />
      )}

      {route === 'packages' && <PackagesView videos={videos} />}

      {route === 'downloads' && <DownloadsView onPlayOffline={handlePlayOffline} />}

      <VideoDetailModal
        video={detailVideo}
        onClose={() => setDetailVideo(null)}
        onPlay={handlePlayVideo}
        onGoToPackages={() => setRoute('packages')}
        isDownloaded={detailVideo ? downloadedIds.has(detailVideo.id) : false}
        downloadedIds={downloadedIds}
        onDownloadComplete={refreshDownloadedIds}
      />

      <VideoPlayerModal
        video={playingVideo}
        initialEpisodeId={playingEpisodeId}
        offlineBlobUrl={offlineBlobUrl}
        onClose={() => {
          if (offlineBlobUrl) {
            URL.revokeObjectURL(offlineBlobUrl);
          }
          setOfflineBlobUrl(null);
          setPlayingEpisodeId(null);
          setPlayingVideo(null);
        }}
      />

      <PWAInstallBanner />
      <WhatsAppFloatingButton />
    </div>
  );
}

function MozFlixRouter() {
  const { loading } = useAuth();
  const [minIntroDone, setMinIntroDone] = useState(false);
  const [splashRemoved, setSplashRemoved] = useState(false);
  const [isAdminRoute, setIsAdminRoute] = useState(
    () => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  );

  useEffect(() => {
    const t = window.setTimeout(() => setMinIntroDone(true), 1150);
    return () => window.clearTimeout(t);
  }, []);

  const splashFading = minIntroDone && !loading;

  useEffect(() => {
    if (!splashFading) return;
    const t = window.setTimeout(() => setSplashRemoved(true), 320);
    return () => window.clearTimeout(t);
  }, [splashFading]);

  useEffect(() => {
    const onPopState = () => {
      setIsAdminRoute(window.location.pathname.startsWith('/admin'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setIsAdminRoute(path.startsWith('/admin'));
  };

  return (
    <>
      {!splashRemoved && <SplashLoader fadingOut={splashFading} />}
      {isAdminRoute ? (
        <AdminPortal onBackToUserApp={() => navigateTo('/')} />
      ) : (
        <UserApp onNavigateAdmin={() => navigateTo('/admin')} />
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MozFlixRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}
