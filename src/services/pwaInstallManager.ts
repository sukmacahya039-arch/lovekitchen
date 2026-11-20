export type PWAInstallState =
  | 'INSTALL_AVAILABLE'
  | 'INSTALLING'
  | 'INSTALLED'
  | 'DISMISSED'
  | 'UNAVAILABLE'
  | 'ALREADY_INSTALLED';

export type PWAPlatformKind =
  | 'android-chrome'
  | 'ios-safari'
  | 'desktop-chromium'
  | 'embedded-iframe'
  | 'other';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallSnapshot {
  state: PWAInstallState;
  isStandalone: boolean;
  canPromptNative: boolean;
  isInstalling: boolean;
  dismissedInSession: boolean;
  platform: PWAPlatformKind;
  unavailableReason: string;
  lastError: string | null;
}

export type TriggerInstallResult =
  | 'accepted'
  | 'dismissed'
  | 'unavailable'
  | 'busy'
  | 'already_installed';

declare global {
  interface Window {
    __LK_DEFERRED_INSTALL_PROMPT__?: BeforeInstallPromptEvent | null;
    __LK_APP_INSTALLED__?: boolean;
  }
}

export interface PWAInstallEnvironment {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  matchMedia?: (query: string) => {
    matches: boolean;
    addEventListener?: (type: string, listener: (e: { matches: boolean }) => void) => void;
    removeEventListener?: (type: string, listener: (e: { matches: boolean }) => void) => void;
  };
  userAgent: string;
  navigatorStandalone: boolean;
  isEmbeddedIframe: boolean;
  getEarlyPrompt?: () => BeforeInstallPromptEvent | null;
  clearEarlyPrompt?: () => void;
  getEarlyInstalled?: () => boolean;
  getSessionDismissed?: () => boolean;
  setSessionDismissed?: (dismissed: boolean) => void;
  onStandaloneChange?: (isStandalone: boolean) => void;
}

const SESSION_DISMISS_KEY = 'love_kitchen_pwa_dismissed_session_v1';

export function detectPWAPlatform(userAgent: string, isEmbeddedIframe: boolean): PWAPlatformKind {
  if (isEmbeddedIframe) return 'embedded-iframe';
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios-safari';
  if (/android/.test(ua) && /(chrome|crios|edga|samsungbrowser|brave)/.test(ua)) {
    return 'android-chrome';
  }
  if (/(chrome|edg|brave|opera|opr)/.test(ua) && !/android|mobile/.test(ua)) {
    return 'desktop-chromium';
  }
  if (/android/.test(ua)) return 'android-chrome';
  return 'other';
}

export function getUnavailableReasonText(platform: PWAPlatformKind): string {
  switch (platform) {
    case 'ios-safari':
      return 'Safari di iPhone/iPad belum mendukung dialog install otomatis browser. Kamu tetap bisa memasang Love Kitchen lewat tombol Share.';
    case 'embedded-iframe':
      return 'Install langsung memerlukan halaman dibuka penuh di tab Chrome (bukan di dalam jendela preview/iframe).';
    case 'android-chrome':
      return 'Dialog install langsung Chrome belum tersedia pada sesi ini (atau aplikasi sudah pernah dipasang). Gunakan panduan cepat Chrome di bawah.';
    case 'desktop-chromium':
      return 'Dialog install otomatis belum aktif di tab ini. Kamu dapat memasang melalui ikon Install di bilah alamat atau menu Chrome.';
    default:
      return 'Browser ini belum mendukung prompt install PWA otomatis. Gunakan menu browser untuk menambahkan ke layar utama.';
  }
}

function createBrowserEnvironment(): PWAInstallEnvironment | null {
  if (typeof window === 'undefined') return null;

  let embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true;
  }

  return {
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    matchMedia: typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : undefined,
    userAgent: window.navigator?.userAgent ?? '',
    navigatorStandalone: Boolean(
      (window.navigator as Navigator & { standalone?: boolean })?.standalone
    ),
    isEmbeddedIframe: embedded,
    getEarlyPrompt: () => window.__LK_DEFERRED_INSTALL_PROMPT__ ?? null,
    clearEarlyPrompt: () => {
      window.__LK_DEFERRED_INSTALL_PROMPT__ = null;
    },
    getEarlyInstalled: () => Boolean(window.__LK_APP_INSTALLED__),
    getSessionDismissed: () => {
      try {
        return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
      } catch {
        return false;
      }
    },
    setSessionDismissed: (dismissed) => {
      try {
        if (dismissed) {
          window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
        } else {
          window.sessionStorage.removeItem(SESSION_DISMISS_KEY);
        }
      } catch {
        // ignore private browsing quota errors
      }
    },
    onStandaloneChange: (standalone) => {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('pwa-standalone', standalone);
      }
    },
  };
}

/**
 * Real PWA Installation Manager built on native browser APIs:
 * - Captures `beforeinstallprompt` early (zero race condition during Phaser loading).
 * - Executes `deferredPrompt.prompt()` and awaits `deferredPrompt.userChoice` on real user click.
 * - Listens to `appinstalled` and `display-mode: standalone` to confirm real installation.
 * - Never simulates installation or displays fake success.
 */
export class PWAInstallManager {
  private env: PWAInstallEnvironment | null;
  private initialized = false;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private state: PWAInstallState = 'UNAVAILABLE';
  private isStandalone = false;
  private isInstalling = false;
  private dismissedInSession = false;
  private platform: PWAPlatformKind = 'other';
  private lastError: string | null = null;
  private snapshot: PWAInstallSnapshot;

  private listeners = new Set<(snap: PWAInstallSnapshot) => void>();
  private installedCallbacks = new Set<() => void>();

  private boundBeforeInstall: EventListener;
  private boundAppInstalled: EventListener;
  private standaloneMediaQuery: ReturnType<NonNullable<PWAInstallEnvironment['matchMedia']>> | null =
    null;
  private boundStandaloneChange: ((e: { matches: boolean }) => void) | null = null;

  constructor(env?: PWAInstallEnvironment | null) {
    this.env = env === undefined ? createBrowserEnvironment() : env;
    this.boundBeforeInstall = (event: Event) => this.handleBeforeInstallPrompt(event);
    this.boundAppInstalled = () => this.handleAppInstalled();
    this.snapshot = this.buildSnapshot();
  }

  public init(): void {
    if (this.initialized || !this.env) return;
    this.initialized = true;

    this.platform = detectPWAPlatform(this.env.userAgent, this.env.isEmbeddedIframe);
    this.dismissedInSession = Boolean(this.env.getSessionDismissed?.());

    // Feature-detected standalone detection (Android Chrome, Chromium, iOS Safari)
    const standaloneMedia = this.env.matchMedia?.('(display-mode: standalone)');
    const fullscreenMedia = this.env.matchMedia?.('(display-mode: fullscreen)');
    this.isStandalone =
      Boolean(standaloneMedia?.matches) ||
      Boolean(fullscreenMedia?.matches) ||
      Boolean(this.env.navigatorStandalone);
    this.env.onStandaloneChange?.(this.isStandalone);

    if (standaloneMedia?.addEventListener) {
      this.standaloneMediaQuery = standaloneMedia;
      this.boundStandaloneChange = (e) => {
        if (e.matches) {
          this.isStandalone = true;
          this.deferredPrompt = null;
          this.isInstalling = false;
          this.state = 'ALREADY_INSTALLED';
          this.env?.onStandaloneChange?.(true);
          this.emit();
        }
      };
      standaloneMedia.addEventListener('change', this.boundStandaloneChange);
    }

    if (this.isStandalone) {
      this.state = 'ALREADY_INSTALLED';
      this.deferredPrompt = null;
    } else if (this.env.getEarlyInstalled?.()) {
      this.state = 'INSTALLED';
      this.deferredPrompt = null;
    } else {
      const earlyPrompt = this.env.getEarlyPrompt?.() ?? null;
      if (earlyPrompt) {
        this.deferredPrompt = earlyPrompt;
        this.env.clearEarlyPrompt?.();
        this.state = 'INSTALL_AVAILABLE';
      } else {
        this.state = 'UNAVAILABLE';
      }
    }

    this.env.addEventListener('beforeinstallprompt', this.boundBeforeInstall);
    this.env.addEventListener('appinstalled', this.boundAppInstalled);
    this.emit();
  }

  public destroy(): void {
    if (!this.initialized || !this.env) return;
    this.env.removeEventListener('beforeinstallprompt', this.boundBeforeInstall);
    this.env.removeEventListener('appinstalled', this.boundAppInstalled);
    if (this.standaloneMediaQuery?.removeEventListener && this.boundStandaloneChange) {
      this.standaloneMediaQuery.removeEventListener('change', this.boundStandaloneChange);
    }
    this.initialized = false;
    this.listeners.clear();
    this.installedCallbacks.clear();
  }

  public getSnapshot(): PWAInstallSnapshot {
    return this.snapshot;
  }

  private getCurrentState(): PWAInstallState {
    return this.state;
  }

  public subscribe(listener: (snap: PWAInstallSnapshot) => void): () => void {
    if (!this.initialized) {
      this.init();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onInstalled(callback: () => void): () => void {
    this.installedCallbacks.add(callback);
    return () => {
      this.installedCallbacks.delete(callback);
    };
  }

  private handleBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    if (this.isStandalone || this.state === 'ALREADY_INSTALLED' || this.state === 'INSTALLED') {
      return;
    }

    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.env?.clearEarlyPrompt?.();
    this.lastError = null;
    if (!this.isInstalling) {
      this.state = 'INSTALL_AVAILABLE';
    }
    this.emit();
  }

  private handleAppInstalled(): void {
    this.deferredPrompt = null;
    this.env?.clearEarlyPrompt?.();
    this.isInstalling = false;
    this.lastError = null;
    this.state = 'INSTALLED';
    this.emit();
    this.installedCallbacks.forEach((cb) => cb());
  }

  /**
   * Triggers the real native browser installation dialog via `deferredPrompt.prompt()`.
   * Prevents duplicate prompts and never fakes success if the browser does not confirm it.
   */
  public async triggerInstall(): Promise<TriggerInstallResult> {
    if (!this.initialized) {
      this.init();
    }

    if (this.isStandalone || this.state === 'ALREADY_INSTALLED' || this.state === 'INSTALLED') {
      return 'already_installed';
    }

    if (this.isInstalling) {
      return 'busy';
    }

    const promptEvent = this.deferredPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== 'function') {
      this.state = 'UNAVAILABLE';
      this.emit();
      return 'unavailable';
    }

    // Consume prompt immediately to prevent duplicate calls on the same event
    this.deferredPrompt = null;
    this.isInstalling = true;
    this.lastError = null;
    this.state = 'INSTALLING';
    this.emit();

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice?.outcome === 'accepted') {
        // Do NOT fake INSTALLED here if browser has not yet fired `appinstalled`.
        // Keep `INSTALLING` until `appinstalled` fires (or if `appinstalled` already fired
        // while awaiting `userChoice`, keep the confirmed `INSTALLED` state).
        const currentState = this.getCurrentState();
        if (currentState !== 'INSTALLED' && currentState !== 'ALREADY_INSTALLED') {
          this.isInstalling = true;
          this.emit();
        }
        return 'accepted';
      }

      this.isInstalling = false;
      this.dismissedInSession = true;
      this.env?.setSessionDismissed?.(true);
      this.state = 'DISMISSED';
      this.emit();
      return 'dismissed';
    } catch (err) {
      this.isInstalling = false;
      this.lastError = err instanceof Error ? err.message : 'Gagal membuka dialog install browser.';
      this.state = this.deferredPrompt ? 'INSTALL_AVAILABLE' : 'UNAVAILABLE';
      this.emit();
      return 'unavailable';
    }
  }

  /**
   * Marks install UI dismissed for the current session without destroying a still-valid
   * deferredPrompt (so user can still manually click the header install button later).
   */
  public dismissForSession(): void {
    this.dismissedInSession = true;
    this.env?.setSessionDismissed?.(true);
    if (!this.deferredPrompt && this.state === 'UNAVAILABLE') {
      // Keep UNAVAILABLE state accurate; only session banner suppression changes
    } else if (!this.deferredPrompt && this.state !== 'INSTALLED' && this.state !== 'ALREADY_INSTALLED') {
      this.state = 'DISMISSED';
    }
    this.emit();
  }

  private buildSnapshot(): PWAInstallSnapshot {
    return {
      state: this.state,
      isStandalone: this.isStandalone,
      canPromptNative: Boolean(this.deferredPrompt) && !this.isInstalling && !this.isStandalone,
      isInstalling: this.isInstalling,
      dismissedInSession: this.dismissedInSession,
      platform: this.platform,
      unavailableReason: getUnavailableReasonText(this.platform),
      lastError: this.lastError,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((fn) => fn(this.snapshot));
  }
}

export const pwaInstallManager = new PWAInstallManager();
