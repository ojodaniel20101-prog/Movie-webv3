import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ──────────────────────────────────────────────────────

export type NotificationType =
  | 'match_starting'
  | 'live_score'
  | 'new_content'
  | 'new_episode'
  | 'weekly_summary';

export interface NotificationPreferences {
  matchStarting: boolean;
  liveScoreUpdates: boolean;
  newContent: boolean;
  newEpisodes: boolean;
  weeklySummary: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: number;
  data?: Record<string, unknown>;
}

interface NotificationState {
  // Permission state
  permission: NotificationPermission;
  serviceWorkerRegistered: boolean;
  serviceWorkerRegistration: ServiceWorkerRegistration | null;

  // User preferences
  preferences: NotificationPreferences;

  // In-app notification history
  notifications: AppNotification[];
  unreadCount: number;

  // Actions
  setPermission: (p: NotificationPermission) => void;
  setServiceWorkerRegistered: (v: boolean) => void;
  setServiceWorkerRegistration: (r: ServiceWorkerRegistration | null) => void;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  updateUnreadCount: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ─── Store ───────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      // Initial state
      permission: 'default',
      serviceWorkerRegistered: false,
      serviceWorkerRegistration: null,

      preferences: {
        matchStarting: true,
        liveScoreUpdates: true,
        newContent: true,
        newEpisodes: true,
        weeklySummary: true,
      },

      notifications: [],
      unreadCount: 0,

      // Actions
      setPermission: (p) => set({ permission: p }),

      setServiceWorkerRegistered: (v) => set({ serviceWorkerRegistered: v }),

      setServiceWorkerRegistration: (r) => set({ serviceWorkerRegistration: r }),

      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      addNotification: (n) => {
        const notification: AppNotification = {
          ...n,
          id: generateId(),
          read: false,
          createdAt: Date.now(),
        };
        set((state) => {
          const notifications = [notification, ...state.notifications].slice(0, 100); // Keep last 100
          return {
            notifications,
            unreadCount: notifications.filter((nn) => !nn.read).length,
          };
        });
      },

      markAsRead: (id) => {
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      clearNotifications: () => {
        set({ notifications: [], unreadCount: 0 });
      },

      updateUnreadCount: () => {
        set((state) => ({
          unreadCount: state.notifications.filter((n) => !n.read).length,
        }));
      },
    }),
    {
      name: 'zentrix-notifications',
      partialize: (state) => ({
        permission: state.permission,
        preferences: state.preferences,
        notifications: state.notifications,
        unreadCount: state.unreadCount,
        serviceWorkerRegistered: state.serviceWorkerRegistered,
      }),
    }
  )
);
