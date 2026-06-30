require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');

const megaplayRoutes = require('./routes/megaplay');
const iptvRoutes     = require('./routes/iptv');
const animeRoutes    = require('./routes/anime');        // Python anime-service proxy (Server 1)
const animeHeavenRoutes = require('./routes/animeheaven'); // Node.js fallback scraper
const animePythonRoutesV2 = require('./routes/animeheaven-python-v2');
const animePythonRoutes = require('./routes/animeheaven-python');
const sportsLiveRoutes = require('./routes/sports-live');
const sportsRoutes   = require('./routes/sports');

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173', 'http://localhost:4173',
      'http://127.0.0.1:5173', 'http://127.0.0.1:4173',
    ];
    const isRailway = /^https:\/\/[a-z0-9-]+\.railway\.app$/.test(origin);
    const isVercel  = /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
    if (allowed.includes(origin) || isRailway || isVercel) return callback(null, true);
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests' },
  skip: (req) => req.path.endsWith('/iptv/proxy'),
});
const megaplayLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Too many stream requests — slow down' },
});

app.use('/', limiter);

// ─── API ROUTES ───────────────────────────────────────────
app.use('/api/megaplay', megaplayLimiter, megaplayRoutes);
app.use('/megaplay',     megaplayLimiter, megaplayRoutes);
app.use('/api/iptv', iptvRoutes);
app.use('/iptv',     iptvRoutes);
// Anime Server 1: Python anime-service proxy (localhost:5000)
app.use('/api/anime', animeRoutes);
// Anime fallback: Node.js scraper (direct to animeheaven.me)
app.use('/api/animeheaven', animeHeavenRoutes);
app.use('/api/anime/python', animePythonRoutesV2);
app.use('/api/anime/python-old', animePythonRoutes);
app.use('/api/sports/live', sportsLiveRoutes);
app.use('/api/sports', sportsRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', service: 'Zentrix Streaming API', version: '1.1.0' })
);
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'Zentrix Streaming API', version: '1.1.0' })
);

// ─── SERVE FRONTEND ───────────────────────────────────────
// Serve the built frontend from ../frontend/dist
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — all non-API routes return index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/iptv') && !req.path.startsWith('/megaplay')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
}

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║   🎬  ZENTRIX STREAMING API  🎬              ║
  ╠══════════════════════════════════════════════╣
  ║  Port:      ${PORT}                            ║
  ║  MegaPlay:  /api/megaplay/stream             ║
  ║  Anime S1:  /api/anime  → Python proxy       ║
  ║  Anime S1:  http://127.0.0.1:5000            ║
  ╚══════════════════════════════════════════════╝
  `);
  });
}

module.exports = app;
