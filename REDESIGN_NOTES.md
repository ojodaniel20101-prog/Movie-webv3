# Zentrix — UI/UX Epic Redesign + Live TV Integration

Applied using the **ui-ux-pro-max-skill** design system across the entire frontend (Home, Browse, Details, Watch, Search, Watchlist, Profile, Admin/Super Admin, Support Chat, Trailers feed, and now **Live TV**).

---

## 0. Latest update — MegaPlay sandbox fix + Live TV (IPTV) integration

**MegaPlay fix:** `megaplay.buzz` actively detects sandboxed iframes and refuses to play, showing "Sandboxed our player is not allowed." The player previously only exempted VidLink Pro from the iframe `sandbox` attribute — it now also exempts both MegaPlay servers (`megaplay`, `megaplay-dub`). One-line fix in `VideoPlayer.tsx`: `{...(!isVidlink && !isMegaplay && { sandbox: '...' })}`.

**Live TV integration:** The standalone IPTVHub project (15,129 channels, 200 countries, 323 M3U playlists) is now a first-class part of Zentrix — not a separate app you run alongside it. One backend, one frontend, one `npm run dev`, one `bash setup.sh`.

- **Backend**: `backend/routes/iptv.js` — new Express router mounted at `/api/iptv` in the *same* process as the rest of the API (megaplay, auth, etc.). Parses all 323 `.m3u` files once at boot (now living in `backend/data/streams/`), serves channels/categories/countries from memory, and proxies HLS streams (with on-the-fly `.m3u8` rewriting) so the browser never hits CORS/referer blocks. Zero new backend dependencies — same zero-dep `http`/`https` approach already used for proxying.
- **Frontend**: New `/live` route (`LiveTVPage`), `ChannelCard`/`ChannelRow`/`ChannelGrid` components, a full-screen `LiveVideoPlayer` (hls.js) + `LiveMiniPlayer`, and a dedicated `useLiveTvStore` (favourites, recents, player state — persisted to localStorage like the rest of the app). A "Live TV" row was added to the **Home page** itself, and "Live TV" is now in the top nav and replaces "Trailers" in the bottom tab bar (kept ≤5 tabs per the UI/UX skill; Trailers stays reachable via the top nav and mobile hamburger menu).
- **Dependencies**: `hls.js` was the *only* new package needed — react, react-router-dom, framer-motion, @tanstack/react-query, lucide-react, zustand were all already in use by Zentrix and got reused directly.
- **Performance**: `LiveVideoPlayer`/`LiveMiniPlayer` are lazy-loaded (`React.lazy`) — hls.js is ~500KB and must never bloat the main bundle for people who never open Live TV. Caught and fixed an 800KB main-bundle regression from this during integration.
- **Rate limiting**: the HLS proxy needs to be hit every few seconds per active stream, so it has its own much higher rate-limit ceiling than channel browsing — and is explicitly exempted from the blanket `/api/` limiter (verified empirically that Express rewrites `req.path` relative to the mount point, which is *not* the obvious behavior).
- **Design**: all emoji-as-icons from the original IPTVHub code (category badges, server console output aside) were replaced with Lucide icons, consistent with the rest of Zentrix. Genuine content emoji — country flags, and the Facebook/TikTok-style reaction picker on Trailers — were deliberately left as-is.
- **Verified live**, not just compiled: since this backend is self-hosted (unlike TMDB/AniList, which my sandbox can't reach), I could actually load `/live` and the homepage with real data — 15,129 real channels rendered correctly, including CJK channel names, and clicking a channel opens the full-screen player with proper loading → error-state handling.

---

## 1. Design Foundation

**Fonts** — Replaced default fonts with a proper display/body pairing:
- `Syne` (bold, geometric, distinctive) for headings, logo, titles
- `Inter` for body copy, optimized for screen legibility
- `JetBrains Mono` for technical/code-like text (admin metrics)
- Loaded via `<link>` in `index.html` with `preconnect` for performance

**Color system** — New CSS variable + Tailwind token system in `index.css` / `tailwind.config.js`:
- Primary: Electric violet `#7B6FF0` → Cyan `#22D3EE` gradient identity
- Full background scale (`zx-bg` → `zx-s5`) for layered depth
- Accent palette (pink, teal, amber, coral) for content-type badges
- Semantic tokens (success/error/warning/rating) kept consistent everywhere

**Motion tokens** — `--dur-fast/normal/slow` + spring/smooth/snappy easing curves used consistently across every animation (no ad-hoc durations).

---

## 2. Component Rebuilds

| Component | What changed |
|---|---|
| `Navbar` | Glass-morphism on scroll, animated active-tab pill (Framer Motion `layoutId`), expanding search field, user dropdown with avatar, animated hamburger → X |
| `BottomNav` | Per-tab accent colors with spring-physics active pill + icon glow, safe-area aware, 5-tab limit (mobile nav best practice) |
| `HeroCarousel` | Auto-advancing cinematic carousel, pause-on-hover, keyboard arrows, progress bar, thumbnail rail (desktop), aurora glow accents |
| `ContentCard` / `ContentRow` | Hover-lift with glow shadow, skeleton-first loading, scroll-snap rows with fade edges + scroll arrows, "View All" end-card |
| `SkeletonCard` | Full skeleton family (`SkeletonCard`, `SkeletonRow`, `SkeletonHero`, `SkeletonDetails`) — shimmer animation, layout-matched to prevent CLS |
| `VideoPlayer` | Server selector icons converted from emoji → Lucide vector icons with colored chips |
| `ShareSheet` | WhatsApp/Telegram/Facebook now use proper inline brand SVGs instead of emoji stand-ins |

---

## 3. No-Emoji-Icons Compliance

The skill explicitly flags emoji as structural icons as an anti-pattern (inconsistent rendering across Android/iOS, unprofessional). Audited and fixed **every** structural usage:

- Admin dashboard tabs (📊👥🎬💬 → `LayoutDashboard`, `Users`, `Clapperboard`, `MessageCircle`)
- Browse page genre/sort pills (38 entries across Movies/TV/Anime — 🔥⭐💥😂👻 etc. → `Flame`, `Star`, `Zap`, `Laugh`, `Ghost`, `Swords`, `Drama`, `Bot`, `Compass`...)
- Trailer category nav (🌐🔥🎬📺⛩️ → `Globe`, `Flame`, `Clapperboard`, `Tv`, `Sparkles`...)
- Video player server list + status badges
- Admin content-type labels & rating stars
- Share sheet social icons

**Kept as-is, deliberately:** the trailer reaction picker (❤️😂😱🔥) — this is genuine user-chosen content (like Facebook/TikTok reactions), not a navigation icon, so emoji is the *correct* choice there.

---

## 4. Bugs Found & Fixed

While migrating, a full `tsc --noEmit` + `vite build` pass surfaced and fixed real pre-existing issues:

- **Navbar-overlap bug**: `ProfilePage` and `SupportChatPage` used `pt-6` (24px) under a 64px fixed navbar — top content was clipped. Fixed to `pt-20`.
- **Missing `.env`**: not a code bug, but worth knowing — your env file must sit at `frontend/.env` (already included in this delivery).
- **Missing `original_language` field** on `TMDBMovie`/`TMDBShow` types — real TMDB field used for anime-detection logic but never typed.
- **`.catch()` on Supabase query builders** — Supabase's `PostgrestFilterBuilder` is `PromiseLike`, not a full `Promise`, so `.catch()` isn't typed on it directly. Wrapped all sites in `Promise.resolve(...)` (zero runtime behavior change, fully type-safe now).
- **Missing `vite-env.d.ts`** — `import.meta.env` typing was unresolved.
- Two invalid TMDB image sizes (`w500` passed to a backdrop helper that only accepts `w300/w780/w1280/original`; `w92` passed to a poster helper that only accepts `w185+`).

Result: **zero TypeScript errors, zero build errors**, verified via fresh `npm install && npx tsc --noEmit && npx vite build`.

---

## 5. Accessibility

- Every icon-only button audited for `aria-label` (8 found missing → all fixed: avatar upload, inline edit save/cancel ×2, admin reply send, chat send, back button)
- `:focus-visible` ring added globally
- `prefers-reduced-motion` respected (all animations disabled when set)
- Touch targets standardized to **44px minimum** (`btn-icon`, `btn-primary`, nav links, genre chips)
- `font-size: 16px` enforced on inputs to prevent iOS auto-zoom

---

## 6. Mobile / Android Fit

- `100dvh`/safe-area-aware layouts (`pb-safe` accounts for `env(safe-area-inset-bottom)`)
- Bottom nav sits above Android gesture bar correctly
- `touch-action: manipulation` everywhere to kill tap-delay
- Horizontal content rows use `scroll-snap` + momentum scrolling (`-webkit-overflow-scrolling: touch`)
- Breakpoints tuned (`xs: 390px` for small Android phones, up through `3xl: 1920px`)
- Verified via Playwright at a 412×915 (Android-class) viewport — see screenshots discussed in-conversation

---

## 7. Running it

```bash
bash setup.sh     # installs root + backend + frontend deps, verifies Live TV data is present
npm run dev       # starts backend (:3001) + frontend (:5173) together
```

Or manually:
```bash
cd frontend && npm install && npm run dev      # local dev
cd frontend && npm run build                   # production build → dist/
```

Backend, including the new Live TV (IPTV) router, is untouched-architecture from your original `v12` — just one more route file in the same Express process. Your `.env` (Supabase keys) is already in place at `frontend/.env`. The 323 channel playlists ship in `backend/data/streams/` — nothing to download separately, nothing to run on a second port.

If you previously had a standalone `node server.js` (the old IPTVHub) running on port 8080, you don't need it anymore — kill it, everything now lives in this one project.
