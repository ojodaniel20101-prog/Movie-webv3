# 🎬 Zentrix Streaming

> Next-generation premium entertainment platform for movies, TV shows, and anime.

![Zentrix Banner](https://via.placeholder.com/1200x400/0A0A0F/6D5EF3?text=Zentrix+Streaming)

---

## ✨ Features

- 🎬 **Movies** — Browse, search, and stream thousands of movies
- 📺 **TV Shows** — Full season & episode support with continue watching
- 🌸 **Anime** — Powered by AniList with sub/dub switching
- 🔍 **Smart Search** — Real-time results from TMDB + AniList combined
- 🎭 **Cinematic UI** — OLED black, glassmorphism, Framer Motion animations
- 📱 **Mobile First** — Responsive with bottom navigation for phones
- 💾 **Watch History** — Tracks your progress automatically
- 🔖 **Watchlist & Favorites** — Save content locally + cloud sync
- 👤 **Auth System** — Email/password + Guest mode
- 🎮 **Multi-Server Player** — VidSrc, VidSrc Pro, MegaPlay
- 🌐 **Sub / Dub Toggle** — For anime content

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or higher
- **npm** v8 or higher

### 1 — Clone & Install

```bash
# Install all dependencies (root + frontend + backend)
npm install
npm run install:all
```

### 2 — Start Development

```bash
npm run dev
```

This starts both:
- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:3001

---

## 📁 Project Structure

```
zentrix-streaming/
├── package.json            ← Root: runs both servers
├── frontend/               ← React + Vite + TypeScript
│   ├── src/
│   │   ├── components/     ← UI components
│   │   │   ├── layout/     ← Navbar, BottomNav, Layout
│   │   │   ├── ui/         ← Cards, Hero, ContentRow
│   │   │   └── player/     ← Video player
│   │   ├── pages/          ← Route pages
│   │   ├── services/       ← TMDB & AniList API
│   │   ├── store/          ← Zustand state
│   │   ├── hooks/          ← Custom hooks
│   │   └── types/          ← TypeScript types
│   └── ...config files
└── backend/                ← Express + SQLite
    ├── routes/             ← Auth & user data routes
    ├── middleware/         ← JWT auth middleware
    ├── db/                 ← SQLite database init
    └── index.js            ← Server entry
```

---

## 🛠 Tech Stack

### Frontend
| Package | Purpose |
|---------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| Framer Motion | Animations |
| TanStack Query | Data fetching & caching |
| Zustand | State management |
| React Router v6 | Navigation |
| Lucide React | Icons |

### Backend
| Package | Purpose |
|---------|---------|
| Express | HTTP server |
| better-sqlite3 | Database (no setup needed) |
| JWT | Authentication |
| bcryptjs | Password hashing |

### External APIs
| API | Usage |
|-----|-------|
| TMDB | Movies, TV shows, metadata |
| AniList GraphQL | Anime data, ratings |
| VidSrc | Primary streaming server |
| VidSrc Pro | Secondary streaming server |
| MegaPlay | Sub/dub anime streaming |

---

## 🔑 API Keys

The TMDB API key is pre-configured. To use your own:

1. Get a free key at https://www.themoviedb.org/settings/api
2. Edit `frontend/src/services/tmdb.ts`:
   ```ts
   const TMDB_API_KEY = 'your_key_here';
   ```

---

## 📱 Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Home — hero carousel + content rows |
| `/search` | Search movies, TV, anime |
| `/browse/:category` | Browse movies / tv / anime |
| `/details/:type/:id` | Content detail page |
| `/watch/:type/:id` | Video player |
| `/watchlist` | Saved list, favorites, history |
| `/profile` | User profile & settings |
| `/auth` | Sign in / Register |

---

## 🎨 Design System

- **Background**: OLED Black `#000000`
- **Primary**: Zentrix Violet `#6D5EF3`
- **Accent**: Pink `#EC4899` · Teal `#14B8A6`
- **Gold**: Ratings `#FFD700`
- **Font**: Outfit (display) + DM Sans (body)
- **Animations**: Framer Motion with spring physics

---

## ⚙️ Environment

The backend `.env` is pre-configured for development. For production, update:

```env
PORT=3001
JWT_SECRET=your-strong-secret-here
JWT_EXPIRES_IN=7d
DB_PATH=./db/zentrix.db
```

---

## 🎬 Streaming Notes

Content is embedded via third-party providers:
- **VidSrc** (`vidsrc.wiki`) — Primary, best compatibility
- **VidSrc Pro** (`vidsrc.pro`) — Fast alternative  
- **MegaPlay** (`megaplay.buzz`) — Sub/dub anime support

Switch servers in the player if a stream doesn't load.

---

*Built with ❤️ · Powered by TMDB & AniList*
