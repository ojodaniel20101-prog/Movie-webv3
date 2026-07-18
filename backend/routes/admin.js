const express = require('express');
const router = express.Router();

// In-memory guest session store
const guestSessions = new Map();

// Clean up guests that haven't pinged in 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of guestSessions.entries()) {
    if (now - session.lastSeen > 60000) guestSessions.delete(id);
  }
}, 30000);

router.post('/guest-heartbeat', (req, res) => {
  const { guestId, page } = req.body;
  if (!guestId) return res.status(400).json({ error: 'guestId required' });
  guestSessions.set(guestId, { lastSeen: Date.now(), page: page || '/' });
  res.json({ ok: true });
});

router.get('/guests-online', (req, res) => {
  res.json({ 
    count: guestSessions.size, 
    guests: Array.from(guestSessions.entries()).map(([id, s]) => ({ id, ...s })) 
  });
});

module.exports = router;

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
