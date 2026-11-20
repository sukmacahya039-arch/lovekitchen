import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PWAInstallManager,
  type BeforeInstallPromptEvent,
  type PWAInstallEnvironment,
} from '../src/services/pwaInstallManager.ts';

function createMockEnvironment(options?: {
  userAgent?: string;
  standaloneMedia?: boolean;
  navigatorStandalone?: boolean;
  isEmbeddedIframe?: boolean;
  earlyPrompt?: BeforeInstallPromptEvent | null;
  earlyInstalled?: boolean;
}) {
  const listeners = new Map<string, Set<EventListener>>();
  let sessionDismissed = false;
  let earlyPrompt = options?.earlyPrompt ?? null;
  let standaloneApplied: boolean | null = null;

  const env: PWAInstallEnvironment = {
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    matchMedia: (query) => ({
      matches:
        query === '(display-mode: standalone)' ? Boolean(options?.standaloneMedia) : false,
    }),
    userAgent:
      options?.userAgent ??
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    navigatorStandalone: Boolean(options?.navigatorStandalone),
    isEmbeddedIframe: Boolean(options?.isEmbeddedIframe),
    getEarlyPrompt: () => earlyPrompt,
    clearEarlyPrompt: () => {
      earlyPrompt = null;
    },
    getEarlyInstalled: () => Boolean(options?.earlyInstalled),
    getSessionDismissed: () => sessionDismissed,
    setSessionDismissed: (d) => {
      sessionDismissed = d;
    },
    onStandaloneChange: (val) => {
      standaloneApplied = val;
    },
  };

  const dispatch = (type: string, eventObj?: Event) => {
    const evt = eventObj ?? ({ type, preventDefault() {} } as unknown as Event);
    for (const fn of listeners.get(type) ?? []) {
      fn(evt);
    }
  };

  return {
    env,
    dispatch,
    getSessionDismissed: () => sessionDismissed,
    getStandaloneApplied: () => standaloneApplied,
  };
}

function createFakePromptEvent(outcome: 'accepted' | 'dismissed') {
  let promptCalls = 0;
  let preventDefaultCalls = 0;
  let resolveChoice!: (val: { outcome: 'accepted' | 'dismissed'; platform: string }) => void;
  const userChoice = new Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>(
    (resolve) => {
      resolveChoice = resolve;
    }
  );

  const event = {
    type: 'beforeinstallprompt',
    platforms: ['web'],
    preventDefault() {
      preventDefaultCalls += 1;
    },
    async prompt() {
      promptCalls += 1;
    },
    userChoice,
  } as unknown as BeforeInstallPromptEvent;

  return {
    event,
    finishChoice: () => resolveChoice({ outcome, platform: 'web' }),
    getPromptCalls: () => promptCalls,
    getPreventDefaultCalls: () => preventDefaultCalls,
  };
}

// =============================================================================
// TEST A — ANDROID CHROME DIRECT NATIVE INSTALLATION FLOW
// =============================================================================
test('PWA [A1] Android Chrome: captures beforeinstallprompt, prevents duplicates while installing, and confirms INSTALLED only on appinstalled', async () => {
  const { env, dispatch } = createMockEnvironment();
  const manager = new PWAInstallManager(env);
  manager.init();

  assert.equal(manager.getSnapshot().state, 'UNAVAILABLE');
  assert.equal(manager.getSnapshot().platform, 'android-chrome');

  // Browser fires beforeinstallprompt
  const promptMock = createFakePromptEvent('accepted');
  dispatch('beforeinstallprompt', promptMock.event);

  assert.equal(promptMock.getPreventDefaultCalls(), 1);
  assert.equal(manager.getSnapshot().state, 'INSTALL_AVAILABLE');
  assert.equal(manager.getSnapshot().canPromptNative, true);

  let installedCallbackCount = 0;
  manager.onInstalled(() => {
    installedCallbackCount += 1;
  });

  // User taps "Install Love Kitchen" -> triggers native prompt
  const firstInstallPromise = manager.triggerInstall();
  assert.equal(manager.getSnapshot().state, 'INSTALLING');
  assert.equal(manager.getSnapshot().isInstalling, true);
  assert.equal(manager.getSnapshot().canPromptNative, false);

  // Duplicate tap while installing must be blocked
  const duplicateResult = await manager.triggerInstall();
  assert.equal(duplicateResult, 'busy');
  assert.equal(promptMock.getPromptCalls(), 1);

  // User accepts native Chrome prompt -> still waits for real `appinstalled` confirmation
  promptMock.finishChoice();
  const result = await firstInstallPromise;
  assert.equal(result, 'accepted');
  assert.equal(manager.getSnapshot().state, 'INSTALLING');
  assert.equal(installedCallbackCount, 0);

  // Browser fires real `appinstalled` event -> state transitions to INSTALLED
  dispatch('appinstalled');
  assert.equal(manager.getSnapshot().state, 'INSTALLED');
  assert.equal(manager.getSnapshot().isInstalling, false);
  assert.equal(manager.getSnapshot().canPromptNative, false);
  assert.equal(installedCallbackCount, 1);

  manager.destroy();
});

test('PWA [A2] Early beforeinstallprompt captured before React/Phaser mount is picked up immediately', () => {
  const promptMock = createFakePromptEvent('accepted');
  const { env } = createMockEnvironment({ earlyPrompt: promptMock.event });
  const manager = new PWAInstallManager(env);
  manager.init();

  assert.equal(manager.getSnapshot().state, 'INSTALL_AVAILABLE');
  assert.equal(manager.getSnapshot().canPromptNative, true);

  manager.destroy();
});

// =============================================================================
// TEST B — DISMISS FLOW & SESSION SUPPRESSION
// =============================================================================
test('PWA [B] Dismissing native prompt sets DISMISSED state and suppresses repeated modal in same session', async () => {
  const { env, dispatch, getSessionDismissed } = createMockEnvironment();
  const manager = new PWAInstallManager(env);
  manager.init();

  const promptMock = createFakePromptEvent('dismissed');
  dispatch('beforeinstallprompt', promptMock.event);
  assert.equal(manager.getSnapshot().state, 'INSTALL_AVAILABLE');

  const p = manager.triggerInstall();
  promptMock.finishChoice();
  const result = await p;

  assert.equal(result, 'dismissed');
  assert.equal(manager.getSnapshot().state, 'DISMISSED');
  assert.equal(manager.getSnapshot().dismissedInSession, true);
  assert.equal(getSessionDismissed(), true);
  assert.equal(manager.getSnapshot().canPromptNative, false);

  manager.destroy();
});

// =============================================================================
// TEST C — ALREADY INSTALLED / STANDALONE MODE DETECTION
// =============================================================================
test('PWA [C] Standalone mode (Android display-mode: standalone & iOS navigator.standalone) sets ALREADY_INSTALLED and suppresses prompts', () => {
  const androidStandalone = createMockEnvironment({ standaloneMedia: true });
  const m1 = new PWAInstallManager(androidStandalone.env);
  m1.init();

  assert.equal(m1.getSnapshot().state, 'ALREADY_INSTALLED');
  assert.equal(m1.getSnapshot().isStandalone, true);
  assert.equal(m1.getSnapshot().canPromptNative, false);
  assert.equal(androidStandalone.getStandaloneApplied(), true);

  // Even if beforeinstallprompt somehow fires, standalone mode ignores it
  const promptMock = createFakePromptEvent('accepted');
  androidStandalone.dispatch('beforeinstallprompt', promptMock.event);
  assert.equal(m1.getSnapshot().state, 'ALREADY_INSTALLED');

  // iOS navigator.standalone detection
  const iosStandalone = createMockEnvironment({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
    navigatorStandalone: true,
  });
  const m2 = new PWAInstallManager(iosStandalone.env);
  m2.init();
  assert.equal(m2.getSnapshot().state, 'ALREADY_INSTALLED');
  assert.equal(m2.getSnapshot().isStandalone, true);

  m1.destroy();
  m2.destroy();
});

// =============================================================================
// TEST D — UNSUPPORTED BROWSER & IFRAME FALLBACK (NO FAKE INSTALL)
// =============================================================================
test('PWA [D] Unsupported browser (iOS Safari) and embedded iframe remain UNAVAILABLE and never fake install success', async () => {
  const iosMock = createMockEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const iosMgr = new PWAInstallManager(iosMock.env);
  iosMgr.init();

  assert.equal(iosMgr.getSnapshot().state, 'UNAVAILABLE');
  assert.equal(iosMgr.getSnapshot().platform, 'ios-safari');
  assert.equal(iosMgr.getSnapshot().canPromptNative, false);
  assert.ok(iosMgr.getSnapshot().unavailableReason.includes('Safari'));

  const attempt = await iosMgr.triggerInstall();
  assert.equal(attempt, 'unavailable');
  assert.equal(iosMgr.getSnapshot().state, 'UNAVAILABLE');

  const iframeMock = createMockEnvironment({ isEmbeddedIframe: true });
  const iframeMgr = new PWAInstallManager(iframeMock.env);
  iframeMgr.init();
  assert.equal(iframeMgr.getSnapshot().platform, 'embedded-iframe');
  assert.equal(iframeMgr.getSnapshot().state, 'UNAVAILABLE');

  iosMgr.destroy();
  iframeMgr.destroy();
});

// =============================================================================
// TEST E — REAL PUBLIC ICON ASSETS EXIST & ARE VALID PNGs
// =============================================================================
test('PWA [E] Required PWA icon assets (192x192, 512x512, maskable 512x512, apple-touch-icon) exist with valid PNG dimensions', () => {
  const publicDir = path.resolve(process.cwd(), 'public');
  const checks: Array<{ file: string; width: number; height: number }> = [
    { file: 'pwa-192x192.png', width: 192, height: 192 },
    { file: 'pwa-512x512.png', width: 512, height: 512 },
    { file: 'pwa-maskable-512x512.png', width: 512, height: 512 },
    { file: 'apple-touch-icon.png', width: 180, height: 180 },
  ];

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const item of checks) {
    const fullPath = path.join(publicDir, item.file);
    assert.ok(fs.existsSync(fullPath), `Missing PWA icon: ${item.file}`);
    const buf = fs.readFileSync(fullPath);
    assert.ok(buf.subarray(0, 8).equals(pngSig), `${item.file} must be a valid PNG file`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(width, item.width, `${item.file} width mismatch`);
    assert.equal(height, item.height, `${item.file} height mismatch`);
  }

  assert.ok(fs.existsSync(path.join(publicDir, 'icon.svg')), 'Missing public/icon.svg');
});
