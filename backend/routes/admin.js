const express = require('express');
const router = express.Router();

// In-memory stores
const guestSessions = new Map();
const guestActivities = new Map();

// Clean up guests that haven't pinged in 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of guestSessions.entries()) {
    if (now - session.lastSeen > 60000) {
      guestSessions.delete(id);
    }
  }
}, 30000);

router.post('/guest-heartbeat', (req, res) => {
  const { guestId, page, device } = req.body;
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  const existing = guestSessions.get(guestId) || { firstSeen: Date.now(), device };
  guestSessions.set(guestId, {
    ...existing,
    lastSeen: Date.now(),
    page: page || '/',
    device: device || 'unknown',
  });
  res.json({ ok: true });
});

router.post('/guest-activity', (req, res) => {
  const { guestId, type, page, timeSpent, device, timestamp } = req.body;
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  if (!guestActivities.has(guestId)) guestActivities.set(guestId, []);
  const activities = guestActivities.get(guestId);
  activities.push({ type, page, timeSpent, device, timestamp: timestamp || Date.now() });
  // Keep only last 50 activities per guest
  if (activities.length > 50) activities.shift();
  res.json({ ok: true });
});

router.post('/guest-offline', (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { guestId } = JSON.parse(body);
      if (guestId) guestSessions.delete(guestId);
    } catch(e) {}
    res.status(200).end();
  });
});

router.get('/guests-online', (req, res) => {
  const guests = Array.from(guestSessions.entries()).map(([id, s]) => ({
    id,
    ...s,
    activities: guestActivities.get(id) || [],
  }));
  res.json({ count: guests.length, guests });
});

module.exports = router;
