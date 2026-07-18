import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

const BACKEND = import.meta.env.VITE_API_URL || '';

function getGuestId(): string {
  let id = localStorage.getItem('zentrix_guest_id');
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('zentrix_guest_id', id);
  }
  return id;
}

export function useGuestTracking() {
  const location = useLocation();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) return;
    const guestId = getGuestId();

    const ping = () => {
      fetch(`${BACKEND}/api/admin/guest-heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, page: location.pathname }),
      }).catch(() => {});
    };

    const remove = () => {
      navigator.sendBeacon(`${BACKEND}/api/admin/guest-offline`, JSON.stringify({ guestId }));
    };

    ping();
    const interval = setInterval(ping, 30000);
    window.addEventListener('beforeunload', remove);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') remove();
      else ping();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', remove);
      remove();
    };
  }, [location.pathname, user]);
}
