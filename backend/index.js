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
const footballStatsRoutes = require('./routes/football-stats');
const embedhdRoutes  = require('./routes/embedhd');
const movieboxRoutes = require('./routes/moviebox');
const septorchRoutes = require('./routes/septorch-movies');

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
app.use('/api/football', footballStatsRoutes);
app.use('/api/embedhd', embedhdRoutes);
app.use('/api/moviebox', movieboxRoutes);
app.use('/api/septorch', septorchRoutes);

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
  // No built frontend — serve a minimal stream-test page at /test
  app.get('/test', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Stream Test</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.16"></script>
    <style>body{background:#0a0a16;color:#fff;font-family:system-ui;padding:20px}
    .ch{margin:10px 0;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px}
    video{width:320px;height:180px;background:#000;border-radius:8px}
    .st{display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;margin-left:10px}
    .st.ld{background:#f59e0b;color:#000}.st.ok{background:#10b981}.st.er{background:#ef4444}</style>
    </head><body><h1>Kids Channel Stream Test</h1><div id="c"></div>
    <script>
    const ch=[
      {n:'Cartoon Network',u:'/api/iptv/proxy?url='+encodeURIComponent('http://23.237.104.106:8080/USA_CARTOON_NETWORK/index.m3u8')},
      {n:'Nickelodeon',u:'/api/iptv/proxy?url='+encodeURIComponent('http://23.237.104.106:8080/USA_NICKELODEON/index.m3u8')},
      {n:'Disney Junior',u:'/api/iptv/proxy?url='+encodeURIComponent('http://23.237.104.106:8080/USA_DISNEY_JUNIOR/index.m3u8')},
      {n:'PBS Kids',u:'/api/iptv/proxy?url='+encodeURIComponent('https://livestream.pbskids.org/out/v1/14507d931bbe48a69287e4850e53443c/est.m3u8')},
      {n:'Boomerang',u:'/api/iptv/proxy?url='+encodeURIComponent('http://23.237.104.106:8080/USA_BOOMERANG/index.m3u8')}
    ];
    const d=document.getElementById('c');
    ch.forEach((c,i)=>{
      const x=document.createElement('div');x.className='ch';
      x.innerHTML='<h3>'+c.n+' <span id=s'+i+' class="st ld">Loading...</span></h3><video id=v'+i+' controls muted playsinline></video>';
      d.appendChild(x);
      const v=document.getElementById('v'+i),s=document.getElementById('s'+i);
      if(Hls.isSupported()){
        const h=new Hls({enableWorker:true,maxBufferLength:30,manifestLoadingTimeOut:20000,fragLoadingTimeOut:20000});
        h.loadSource(c.u);h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));
        v.addEventListener('playing',()=>{s.textContent='Playing!';s.className='st ok';});
        h.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal){s.textContent='Err:'+d.type;s.className='st er';console.error(c.n,d);}});
      }else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=c.u;v.play().catch(()=>{});v.addEventListener('playing',()=>{s.textContent='Playing!';s.className='st ok';});}
    });
    </script></body></html>`);
  });
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
