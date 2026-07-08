# Zentrix Stream — Supabase Setup Guide
Complete step-by-step backend setup. Follow in order.

---

## 1. Create your Supabase Project

1. Go to https://supabase.com and sign in
2. Click **New Project** → fill in name, password, region
3. Wait ~2 minutes for provisioning
4. Go to **Settings → API** and copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
5. Create `frontend/.env` from `.env.example` and paste those values

---

## 2. Run the Database Schema

Open **SQL Editor** in your Supabase dashboard and run each block below.

### 2a. Profiles Table
```sql
CREATE TABLE public.profiles (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  display_name     TEXT        NOT NULL DEFAULT 'User',
  photo_url        TEXT,
  custom_photo_url TEXT,
  bio              TEXT        NOT NULL DEFAULT '',
  location         TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online        BOOLEAN     NOT NULL DEFAULT FALSE,
  role             TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_banned        BOOLEAN     NOT NULL DEFAULT FALSE,
  ban_reason       TEXT,
  banned_at        TIMESTAMPTZ,
  watchlist_count  INTEGER     NOT NULL DEFAULT 0,
  watched_count    INTEGER     NOT NULL DEFAULT 0
);

-- Index for fast lookups
CREATE INDEX profiles_email_idx ON public.profiles(email);
CREATE INDEX profiles_role_idx  ON public.profiles(role);
```

### 2b. Watchlist Table
```sql
CREATE TABLE public.watchlist (
  id            TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id    TEXT        NOT NULL,
  content_type  TEXT        NOT NULL CHECK (content_type IN ('movie','tv','anime')),
  title         TEXT        NOT NULL,
  poster_path   TEXT,
  backdrop_path TEXT,
  overview      TEXT        NOT NULL DEFAULT '',
  vote_average  REAL        NOT NULL DEFAULT 0,
  release_year  TEXT        NOT NULL DEFAULT '',
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, content_id, content_type)
);

CREATE INDEX watchlist_user_idx ON public.watchlist(user_id);
```

### 2c. Favorites Table
```sql
CREATE TABLE public.favorites (
  id            TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id    TEXT        NOT NULL,
  content_type  TEXT        NOT NULL CHECK (content_type IN ('movie','tv','anime')),
  title         TEXT        NOT NULL,
  poster_path   TEXT,
  backdrop_path TEXT,
  overview      TEXT        NOT NULL DEFAULT '',
  vote_average  REAL        NOT NULL DEFAULT 0,
  release_year  TEXT        NOT NULL DEFAULT '',
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, content_id, content_type)
);

CREATE INDEX favorites_user_idx ON public.favorites(user_id);
```

### 2d. Watch History Table
```sql
CREATE TABLE public.watch_history (
  id               TEXT        PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id       TEXT        NOT NULL,
  content_type     TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  poster_path      TEXT,
  backdrop_path    TEXT,
  season_number    INTEGER,
  episode_number   INTEGER,
  episode_title    TEXT,
  progress_seconds INTEGER     NOT NULL DEFAULT 0,
  duration_seconds INTEGER     NOT NULL DEFAULT 0,
  watched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, content_id, content_type)
);

CREATE INDEX watch_history_user_idx     ON public.watch_history(user_id);
CREATE INDEX watch_history_watched_idx  ON public.watch_history(watched_at DESC);
```

### 2e. Watch Events Table (Analytics)
```sql
CREATE TABLE public.watch_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id   TEXT        NOT NULL,
  content_type TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  watched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date         DATE        NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX watch_events_user_idx ON public.watch_events(user_id);
CREATE INDEX watch_events_date_idx ON public.watch_events(date DESC);
```

---

## 3. Enable Row Level Security (RLS)

Run this entire block in the SQL Editor:

```sql
-- ── Enable RLS on all tables ────────────────────────────────────────────────
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_events  ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ────────────────────────────────────────────────────────────────
-- All authenticated users can read all profiles (needed for admin dashboard)
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Users can only insert their own profile
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Users can update their own profile; admins can update any profile
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete profiles
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── WATCHLIST ────────────────────────────────────────────────────────────────
CREATE POLICY "watchlist_all" ON public.watchlist
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── FAVORITES ────────────────────────────────────────────────────────────────
CREATE POLICY "favorites_all" ON public.favorites
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── WATCH HISTORY ─────────────────────────────────────────────────────────────
CREATE POLICY "watch_history_all" ON public.watch_history
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── WATCH EVENTS ──────────────────────────────────────────────────────────────
-- Users can insert their own events; admins can read all
CREATE POLICY "watch_events_insert" ON public.watch_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "watch_events_select" ON public.watch_events
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

## 4. Enable Realtime for Admin Dashboard

In **Database → Replication**, enable replication for the `profiles` table so the admin dashboard updates live when users sign in/out.

Or run in SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
```

---

## 5. Set Up Storage (Profile Images)

### Option A — Dashboard (easiest)
1. Go to **Storage** in your Supabase dashboard
2. Click **Create a new bucket**
3. Name it exactly: `profile-images`
4. Check **Public bucket** ✓
5. Click **Create bucket**

### Option B — SQL Editor
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true);
```

### Storage Policies
```sql
-- Anyone can view profile images (public bucket)
CREATE POLICY "profile_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-images');

-- Authenticated users can upload to their own folder
CREATE POLICY "profile_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update/delete their own images
CREATE POLICY "profile_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## 6. Enable Google OAuth

1. Go to **Authentication → Providers → Google**
2. Toggle **Enable** on
3. You need a Google OAuth client:

   **Create Google OAuth Client:**
   - Go to https://console.cloud.google.com
   - Create a project (or use existing)
   - Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth 2.0 Client IDs**
   - Application type: **Web application**
   - Add to **Authorized redirect URIs**:
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     ```
   - Copy the **Client ID** and **Client Secret**

4. Back in Supabase → Google provider:
   - Paste **Client ID** and **Client Secret**
   - Click **Save**

5. Add your app URLs to **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:5173` (dev) or your production URL
   - **Redirect URLs**: Add both:
     ```
     http://localhost:5173/
     https://your-production-domain.com/
     ```

---

## 7. Set Your Admin Email

In `src/lib/supabase.ts`, update the `ADMIN_EMAILS` array with your email(s):

```typescript
export const ADMIN_EMAILS: string[] = ['your@email.com'];
```

The first time you sign in with that email, you'll automatically be given the `admin` role.

---

## 8. Install & Run

```bash
cd frontend

# Copy env file
cp .env.example .env
# Edit .env and fill in your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Install (firebase is gone, supabase is in)
npm install

# Start dev server
npm run dev
```

---

## 9. Verify Everything Works

After signing in with Google:

| Check | Where to verify |
|-------|----------------|
| Profile created | Supabase → Table Editor → profiles |
| Watchlist syncs | Add something → check watchlist table |
| Favorites sync  | Add a favorite → check favorites table |
| Profile photo   | Upload in Profile page → check Storage |
| Watch history   | Watch something → check watch_history table |
| Analytics       | Watch events → Admin dashboard graph |
| Admin access    | Navigate to `/admin` with your admin email |

---

## 10. Production Deployment (Vercel / Netlify)

Add these environment variables in your hosting dashboard:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Then add your production domain to:
- Supabase → Authentication → URL Configuration → Redirect URLs
- Google OAuth → Authorized redirect URIs (the Supabase callback URL stays the same)

---

## Troubleshooting

**"Invalid login credentials" / OAuth not working**
→ Check that your redirect URL in Google Console matches exactly: `https://your-ref.supabase.co/auth/v1/callback`

**Profile not being created after sign-in**
→ Make sure the RLS `profiles_insert` policy is in place and uses `WITH CHECK (auth.uid() = id)`

**Admin dashboard shows no users**
→ The `profiles_select` policy must allow `USING (true)` for authenticated users

**Profile photo upload fails**
→ Check the `profile-images` bucket exists and is set to **public**

**Watch graph is empty**
→ This populates as users watch content. Events are logged to `watch_events` automatically.

**Banned user can still sign in**
→ The ban check happens in `initAuth` inside `useAuthStore.ts` — if `profile.is_banned` is true, the user is immediately signed out after the auth event fires.
