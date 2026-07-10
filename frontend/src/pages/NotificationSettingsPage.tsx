import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Bell, BellOff, BellRing, ChevronRight,
  Trophy, Zap, Film, Tv, BarChart3, Trash2, AlertTriangle,
  Check,
} from 'lucide-react';
import { useNotificationStore, type NotificationType } from '@/store/useNotificationStore';
import {
  requestNotificationPermission,
  sendLocalNotification,
  notifyMatchStarting,
  notifyLiveScore,
  notifyNewContent,
  notifyNewEpisode,
  notifyWeeklySummary,
} from '@/services/notifications';
import toast from 'react-hot-toast';

// ─── Notification type config ────────────────────────────────────

interface NotificationConfig {
  key: keyof typeof import('@/store/useNotificationStore').prototype extends never ? never : { matchStarting: boolean; liveScoreUpdates: boolean; newContent: boolean; newEpisodes: boolean; weeklySummary: boolean };
  type: NotificationType;
  icon: typeof Trophy;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  example: string;
}

const NOTIFICATION_CONFIGS: Omit<NotificationConfig, 'key'>[] = [
  {
    type: 'match_starting',
    icon: Trophy,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: 'Match Starting Soon',
    description: 'Get notified before your favorite matches begin',
    example: '⚽ Real Madrid vs Barcelona starts in 15 minutes!',
  },
  {
    type: 'live_score',
    icon: Zap,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    title: 'Live Score Updates',
    description: 'Instant alerts for goals and match events',
    example: '⚽ GOAL! Real Madrid 1 - 0 Barcelona (45\')',
  },
  {
    type: 'new_content',
    icon: Film,
    iconColor: 'text-primary-400',
    iconBg: 'bg-primary-500/10',
    title: 'New Movies & Shows',
    description: 'Be the first to know when new content is added',
    example: '🎬 New Action movie added: Title',
  },
  {
    type: 'new_episode',
    icon: Tv,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    title: 'New Episodes',
    description: 'Alerts when new episodes of shows you follow are available',
    example: '📺 New episode of Show available — S2E5',
  },
  {
    type: 'weekly_summary',
    icon: BarChart3,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    title: 'Weekly Summary',
    description: 'A weekly digest of your watching activity',
    example: '📊 This week you watched 5 movies and 3 episodes',
  },
];

const PREFERENCE_KEY_MAP: Record<NotificationType, string> = {
  match_starting: 'matchStarting',
  live_score: 'liveScoreUpdates',
  new_content: 'newContent',
  new_episode: 'newEpisodes',
  weekly_summary: 'weeklySummary',
};

// ─── Component ───────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const navigate = useNavigate();
  const {
    permission,
    preferences,
    notifications,
    unreadCount,
    updatePreferences,
    markAllAsRead,
    clearNotifications,
  } = useNotificationStore();

  const [isRequesting, setIsRequesting] = useState(false);

  // Refresh permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      useNotificationStore.getState().setPermission(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    await requestNotificationPermission();
    setIsRequesting(false);
  };

  const togglePreference = (type: NotificationType) => {
    const key = PREFERENCE_KEY_MAP[type] as keyof typeof preferences;
    const current = preferences[key];
    updatePreferences({ [key]: !current } as Partial<typeof preferences>);
    toast.success(`${!current ? 'Enabled' : 'Disabled'} notifications`);
  };

  const handleTestNotification = async (type: NotificationType) => {
    if (permission !== 'granted') {
      toast.error('Enable notifications first');
      return;
    }

    let sent = false;
    switch (type) {
      case 'match_starting':
        sent = await notifyMatchStarting('Real Madrid', 'Barcelona', 15);
        break;
      case 'live_score':
        sent = await notifyLiveScore('Real Madrid', 'Barcelona', 1, 0, 45, 'Vinicius Jr');
        break;
      case 'new_content':
        sent = await notifyNewContent('The Dark Knight', 'movie', '123');
        break;
      case 'new_episode':
        sent = await notifyNewEpisode('Breaking Bad', 2, 5, '456');
        break;
      case 'weekly_summary':
        sent = await notifyWeeklySummary(5, 3);
        break;
    }

    if (sent) {
      toast.success('Test notification sent!');
    } else {
      toast.error('Failed to send test notification');
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-20 pb-safe">
      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <BellRing size={22} className="text-primary-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-white">Notifications</h1>
            <p className="text-sm text-gray-500">Manage your notification preferences</p>
          </div>
        </div>
      </motion.div>

      {/* ── Permission Status ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-white/[0.07] mb-4 overflow-hidden"
        style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}
      >
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                permission === 'granted'
                  ? 'bg-emerald-500/10'
                  : permission === 'denied'
                    ? 'bg-red-500/10'
                    : 'bg-amber-500/10'
              }`}>
                {permission === 'granted' ? (
                  <Bell size={18} className="text-emerald-400" />
                ) : permission === 'denied' ? (
                  <BellOff size={18} className="text-red-400" />
                ) : (
                  <Bell size={18} className="text-amber-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {permission === 'granted'
                    ? 'Notifications Enabled'
                    : permission === 'denied'
                      ? 'Notifications Blocked'
                      : 'Enable Notifications'}
                </p>
                <p className="text-xs text-gray-500">
                  {permission === 'granted'
                    ? 'You\'re all set to receive notifications'
                    : permission === 'denied'
                      ? 'Enable in browser settings to receive notifications'
                      : 'Allow notifications to stay updated'}
                </p>
              </div>
            </div>

            {permission === 'granted' ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <Check size={12} /> Active
              </span>
            ) : permission === 'denied' ? (
              <button
                onClick={() => toast('Enable notifications in your browser settings, then refresh')}
                className="text-xs text-red-400 font-medium px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-colors"
              >
                Blocked
              </button>
            ) : (
              <button
                onClick={handleRequestPermission}
                disabled={isRequesting}
                className="text-xs text-amber-400 font-medium px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-colors disabled:opacity-50"
              >
                {isRequesting ? 'Requesting...' : 'Enable'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Notification Types ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-2 mb-6"
      >
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-1 mb-2">
          Notification Types
        </p>

        {NOTIFICATION_CONFIGS.map((config, index) => {
          const prefKey = PREFERENCE_KEY_MAP[config.type] as keyof typeof preferences;
          const isEnabled = preferences[prefKey] ?? true;
          const Icon = config.icon;

          return (
            <motion.div
              key={config.type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.03 }}
              className="rounded-2xl border border-white/[0.07] overflow-hidden"
              style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}
            >
              <div className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} className={config.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{config.title}</p>
                      <button
                        onClick={() => togglePreference(config.type)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          isEnabled ? 'bg-primary-500' : 'bg-gray-700'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                            isEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
                    <p className="text-[11px] text-gray-600 mt-1 italic">{config.example}</p>
                  </div>
                </div>

                {/* Test notification button */}
                {permission === 'granted' && isEnabled && (
                  <button
                    onClick={() => handleTestNotification(config.type)}
                    className="mt-2.5 text-[11px] text-primary-400 hover:text-primary-300 font-medium px-3 py-1.5 rounded-lg bg-primary-500/10 hover:bg-primary-500/15 border border-primary-500/20 transition-all"
                  >
                    Send Test Notification
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Notification History ───────────────────────────────── */}
      {notifications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Recent Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-400 font-bold">
                  {unreadCount} unread
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-gray-500 hover:text-white transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm('Clear all notifications?')) {
                    clearNotifications();
                  }
                }}
                className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <Trash2 size={11} />
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {notifications.slice(0, 20).map((notification) => (
              <button
                key={notification.id}
                onClick={() => useNotificationStore.getState().markAsRead(notification.id)}
                className={`w-full text-left rounded-xl px-4 py-3 border transition-all ${
                  notification.read
                    ? 'border-white/[0.04] bg-white/[0.02] opacity-60'
                    : 'border-primary-500/10 bg-primary-500/[0.04]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                    notification.read ? 'bg-gray-700' : 'bg-primary-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${notification.read ? 'text-gray-500' : 'text-white font-medium'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{formatTime(notification.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Browser Permission Help ────────────────────────────── */}
      {permission === 'denied' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300 mb-1">How to enable notifications</p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>Click the lock/info icon in your browser&apos;s address bar</li>
                <li>Find &quot;Notifications&quot; in the site settings</li>
                <li>Change it from &quot;Block&quot; to &quot;Allow&quot;</li>
                <li>Refresh this page</li>
              </ol>
            </div>
          </div>
        </motion.div>
      )}

      <div className="h-12" />
    </div>
  );
}
