import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PWAInstallState {
  /** Whether the app can be installed (beforeinstallprompt fired) */
  canInstall: boolean;
  /** Whether the app is already installed */
  isInstalled: boolean;
  /** Whether the app is running in standalone mode */
  isStandalone: boolean;
  /** Whether the user dismissed the banner */
  isDismissed: boolean;
  /** Whether the device is iOS */
  isIOS: boolean;
  /** Install the app (Android/Chrome) */
  install: () => Promise<void>;
  /** Dismiss the banner */
  dismiss: () => void;
  /** Reset dismissed state (for testing) */
  resetDismissed: () => void;
}

const BANNER_DISMISSED_KEY = 'zentrix-install-banner-dismissed';
const INSTALL_PROMPT_SEEN_KEY = 'zentrix-install-prompt-seen';

// Module-level capture — beforeinstallprompt fires before React mounts,
// so we capture it at the script level to ensure we never miss it.
let capturedPrompt: BeforeInstallPromptEvent | null = null;
let promptCaptured = false;

function captureInstallPrompt(e: Event) {
  e.preventDefault();
  capturedPrompt = e as BeforeInstallPromptEvent;
  promptCaptured = true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', captureInstallPrompt);
}

export function usePWAInstall(): PWAInstallState {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if running in standalone mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    setIsInstalled(standalone);

    // Check if banner was previously dismissed
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    setIsDismissed(dismissed);

    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Use the module-level captured prompt if available (most common case —
    // beforeinstallprompt fires early in page load before React hydrates)
    if (capturedPrompt && !deferredPrompt.current) {
      deferredPrompt.current = capturedPrompt;
      setCanInstall(true);
      setIsInstalled(false);
    }

    // Also listen for late-fired beforeinstallprompt events (e.g., after
    // user interaction or when criteria are met later in the session)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      capturedPrompt = e as BeforeInstallPromptEvent;
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
      setIsInstalled(false);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPrompt.current = null;
      capturedPrompt = null;
      localStorage.setItem(INSTALL_PROMPT_SEEN_KEY, 'true');
    };

    // Listen for display mode changes
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
      setIsInstalled(e.matches);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mq.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt.current) {
      // iOS or no prompt available — show manual instructions
      return;
    }

    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setCanInstall(false);
      }
      deferredPrompt.current = null;
      capturedPrompt = null;
      localStorage.setItem(INSTALL_PROMPT_SEEN_KEY, 'true');
    } catch {
      // Prompt failed
    }
  }, []);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);

  const resetDismissed = useCallback(() => {
    setIsDismissed(false);
    localStorage.removeItem(BANNER_DISMISSED_KEY);
  }, []);

  return {
    canInstall,
    isInstalled,
    isStandalone,
    isDismissed,
    isIOS,
    install,
    dismiss,
    resetDismissed,
  };
}
