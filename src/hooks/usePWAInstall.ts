import { useCallback, useEffect, useState } from 'react';
import {
  pwaInstallManager,
  type PWAInstallSnapshot,
  type TriggerInstallResult,
} from '../services/pwaInstallManager.ts';

export function usePWAInstall() {
  const [snapshot, setSnapshot] = useState<PWAInstallSnapshot>(() => {
    pwaInstallManager.init();
    return pwaInstallManager.getSnapshot();
  });

  useEffect(() => {
    pwaInstallManager.init();
    setSnapshot(pwaInstallManager.getSnapshot());
    return pwaInstallManager.subscribe(setSnapshot);
  }, []);

  const install = useCallback((): Promise<TriggerInstallResult> => {
    return pwaInstallManager.triggerInstall();
  }, []);

  const dismiss = useCallback((): void => {
    pwaInstallManager.dismissForSession();
  }, []);

  const isInstalled =
    snapshot.state === 'INSTALLED' || snapshot.state === 'ALREADY_INSTALLED';

  return {
    ...snapshot,
    isInstallable: snapshot.canPromptNative,
    isInstalled,
    isIOS: snapshot.platform === 'ios-safari',
    install,
    dismiss,
  };
}
