import { useNotificationStore, type NotificationType, type NotificationPreferences } from '@/store/useNotificationStore';
import toast from 'react-hot-toast';

// ─── Service Worker Registration ─────────────────────────────────

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Notifications] Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    useNotificationStore.getState().setServiceWorkerRegistration(registration);
    useNotificationStore.getState().setServiceWorkerRegistered(true);

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            toast.success('App updated! Refresh for the latest version.');
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error('[Notifications] Service worker registration failed:', error);
    return null;
  }
}

// ─── Permission Request ──────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    toast.error('This browser does not support notifications');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    useNotificationStore.getState().setPermission(permission);

    if (permission === 'granted') {
      toast.success('Notifications enabled!');
    } else if (permission === 'denied') {
      toast.error('Notification permission denied. Enable it in browser settings.');
    }

    return permission;
  } catch (error) {
    console.error('[Notifications] Permission request failed:', error);
    return 'denied';
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  const permission = Notification.permission;
  useNotificationStore.getState().setPermission(permission);
  return permission;
}

// ─── Send Local Notification ─────────────────────────────────────

interface SendNotificationOptions {
  title: string;
  body: string;
  type: NotificationType;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
  silent?: boolean;
}

export async function sendLocalNotification(
  options: SendNotificationOptions
): Promise<boolean> {
  const { permission, preferences, serviceWorkerRegistration } =
    useNotificationStore.getState();

  // Check if notifications are enabled for this type
  if (!isNotificationTypeEnabled(options.type, preferences)) {
    return false;
  }

  // Check permission
  if (permission !== 'granted') {
    return false;
  }

  try {
    // Use service worker to show notification for background support
    if (serviceWorkerRegistration) {
      await serviceWorkerRegistration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/icon-192x192.png',
        badge: options.icon || '/icon-192x192.png',
        tag: options.tag || options.type,
        requireInteraction: options.requireInteraction || false,
        data: {
          type: options.type,
          ...options.data,
        },
        vibrate: [200, 100, 200],
      });
    } else {
      // Fallback to standard Notification API
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/icon-192x192.png',
        tag: options.tag || options.type,
        requireInteraction: options.requireInteraction || false,
      });
    }

    // Also store in-app notification
    useNotificationStore.getState().addNotification({
      title: options.title,
      body: options.body,
      type: options.type,
      data: options.data,
    });

    return true;
  } catch (error) {
    console.error('[Notifications] Failed to send notification:', error);
    return false;
  }
}

// ─── Notification Type Checks ────────────────────────────────────

function isNotificationTypeEnabled(
  type: NotificationType,
  prefs: NotificationPreferences
): boolean {
  switch (type) {
    case 'match_starting':
      return prefs.matchStarting;
    case 'live_score':
      return prefs.liveScoreUpdates;
    case 'new_content':
      return prefs.newContent;
    case 'new_episode':
      return prefs.newEpisodes;
    case 'weekly_summary':
      return prefs.weeklySummary;
    default:
      return true;
  }
}

// ─── Preset Notification Senders ─────────────────────────────────

export async function notifyMatchStarting(
  teamA: string,
  teamB: string,
  minutesUntil: number
): Promise<boolean> {
  return sendLocalNotification({
    title: 'Match Starting Soon',
    body: `⚽ ${teamA} vs ${teamB} starts in ${minutesUntil} minutes!`,
    type: 'match_starting',
    tag: `match-${teamA}-${teamB}`,
    data: { type: 'match', teamA, teamB },
  });
}

export async function notifyLiveScore(
  teamA: string,
  teamB: string,
  scoreA: number,
  scoreB: number,
  minute: number,
  scorer?: string
): Promise<boolean> {
  const goalText = scorer ? ` — ${scorer}` : '';
  return sendLocalNotification({
    title: 'GOAL!',
    body: `⚽ ${teamA} ${scoreA} - ${scoreB} ${teamB}${goalText} (${minute}')`,
    type: 'live_score',
    tag: `score-${teamA}-${teamB}`,
    requireInteraction: false,
    data: { type: 'match', teamA, teamB },
  });
}

export async function notifyNewContent(
  title: string,
  contentType: 'movie' | 'show',
  id?: string
): Promise<boolean> {
  return sendLocalNotification({
    title: 'New Content Available',
    body: `🎬 New ${contentType === 'movie' ? 'Action movie' : 'TV show'} added: ${title}`,
    type: 'new_content',
    tag: `content-${title}`,
    data: { type: 'content', id, title },
  });
}

export async function notifyNewEpisode(
  showTitle: string,
  season: number,
  episode: number,
  id?: string
): Promise<boolean> {
  return sendLocalNotification({
    title: 'New Episode Available',
    body: `📺 New episode of ${showTitle} available — S${season}E${episode}`,
    type: 'new_episode',
    tag: `episode-${showTitle}-${season}-${episode}`,
    data: { type: 'episode', id, season, episode },
  });
}

export async function notifyWeeklySummary(
  moviesWatched: number,
  episodesWatched: number
): Promise<boolean> {
  return sendLocalNotification({
    title: 'Your Weekly Summary',
    body: `📊 This week you watched ${moviesWatched} movie${moviesWatched !== 1 ? 's' : ''} and ${episodesWatched} episode${episodesWatched !== 1 ? 's' : ''}`,
    type: 'weekly_summary',
    tag: 'weekly-summary',
  });
}

// ─── Scheduled Notifications (using setTimeout) ─────────────────

interface ScheduledNotification {
  id: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

const scheduledNotifications: Map<string, ScheduledNotification> = new Map();

export function scheduleNotification(
  id: string,
  delayMs: number,
  notificationFn: () => Promise<boolean>
): void {
  // Cancel existing scheduled notification with same ID
  cancelScheduledNotification(id);

  const timeoutId = setTimeout(() => {
    notificationFn();
    scheduledNotifications.delete(id);
  }, delayMs);

  scheduledNotifications.set(id, { id, timeoutId });
}

export function cancelScheduledNotification(id: string): void {
  const existing = scheduledNotifications.get(id);
  if (existing) {
    clearTimeout(existing.timeoutId);
    scheduledNotifications.delete(id);
  }
}

export function cancelAllScheduledNotifications(): void {
  scheduledNotifications.forEach((n) => clearTimeout(n.timeoutId));
  scheduledNotifications.clear();
}
