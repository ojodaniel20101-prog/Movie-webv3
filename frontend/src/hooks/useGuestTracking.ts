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
    if (user) return; // signed in users use heartbeat in App.tsx
    const guestId = getGuestId();

    const ping = () => {
      fetch(`${BACKEND}/api/admin/guest-heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, page: location.pathname }),
      }).catch(() => {});
    };

    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [location.pathname, user]);
}
