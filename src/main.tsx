import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { pwaInstallManager } from './services/pwaInstallManager.ts';
import './index.css';

// Initialize native PWA install listeners before Phaser/React mount so beforeinstallprompt is never missed
pwaInstallManager.init();

// Register Progressive Web App service worker with auto-update
registerSW({
  immediate: true,
});

createRoot(document.getElementById('root')!).render(<App />);
