import { useEffect, useRef } from 'react';
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

function getDeviceType(): string {
  return /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

export function useGuestTracking() {
  const location = useLocation();
  const { user } = useAuthStore();
  const pageStartTime = useRef(Date.now());
  const currentPage = useRef(location.pathname);

  useEffect(() => {
    if (user) return;
    const guestId = getGuestId();
    const device = getDeviceType();

    const ping = (page = location.pathname) => {
      fetch(`${BACKEND}/api/admin/guest-heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, page, device }),
      }).catch(() => {});
    };

    const trackPageLeave = () => {
      const timeSpent = Math.floor((Date.now() - pageStartTime.current) / 1000);
      fetch(`${BACKEND}/api/admin/guest-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId,
          type: 'page_leave',
          page: currentPage.current,
          timeSpent,
          device,
        }),
      }).catch(() => {});
    };

    const trackPageEnter = () => {
      pageStartTime.current = Date.now();
      currentPage.current = location.pathname;
      fetch(`${BACKEND}/api/admin/guest-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId,
          type: 'page_enter',
          page: location.pathname,
          device,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    };

    const remove = () => {
      trackPageLeave();
      navigator.sendBeacon(
        `${BACKEND}/api/admin/guest-offline`,
        JSON.stringify({ guestId })
      );
    };

    trackPageEnter();
    ping();
    const interval = setInterval(ping, 30000);
    window.addEventListener('beforeunload', remove);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', remove);
      trackPageLeave();
    };
  }, [location.pathname, user]);
}
