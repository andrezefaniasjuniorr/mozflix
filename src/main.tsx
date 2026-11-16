import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Regista o Service Worker para cache completo offline e instalação TWA/PWA
registerSW({
  immediate: true,
  onOfflineReady() {
    // App shell e assets guardados no storage local para abrir sem megas
  },
});

createRoot(document.getElementById('root')!).render(<App />);
