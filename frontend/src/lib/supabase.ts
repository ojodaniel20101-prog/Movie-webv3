import { createClient } from '@supabase/supabase-js';

// ─── Supabase Client ─────────────────────────────────────────────────────────
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ─── Admin Config ─────────────────────────────────────────────────────────────
export const ADMIN_EMAILS: string[] = ['danielsuperbusy@gmail.com'];

/** The one account that can promote/demote admins and cannot be touched by anyone */
export const SUPER_ADMIN_EMAIL = 'danielsuperbusy@gmail.com';

// ─── User Profile Type (replaces Firestore UserDocument) ─────────────────────
export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  custom_photo_url: string | null;
  bio: string;
  location: string;
  created_at: string;
  updated_at: string;
  last_seen: string;
  is_online: boolean;
  role: 'user' | 'admin';
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  watchlist_count: number;
  watched_count: number;
}

// ─── Create or update user profile on sign-in ────────────────────────────────
export const upsertUserProfile = async (
  userId: string,
  email: string,
  displayName: string,
  photoURL: string | null,
): Promise<UserProfile> => {
  const now     = new Date().toISOString();
  const isAdmin = ADMIN_EMAILS.includes(email);

  // Step 1: Try to fetch existing profile
  const { data: existing, error: fetchErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();               // maybeSingle() returns null (not error) when 0 rows

  if (fetchErr) throw fetchErr;

  // Step 2a: Existing user — refresh online status, return local merge (no extra query)
  if (existing) {
    await supabase
      .from('profiles')
      .update({ is_online: true, last_seen: now, updated_at: now })
      .eq('id', userId);
    // Return local merge — avoids a second round-trip that could fail on RLS edge cases
    return { ...existing, is_online: true, last_seen: now, updated_at: now } as UserProfile;
  }

  // Step 2b: Brand-new user — insert full profile.
  // display_name now has a case-insensitive UNIQUE constraint in the DB
  // (so two different users can never share one), but Google's default
  // name (or our 'User' fallback) can easily collide between two people.
  // Retry with a short random suffix on conflict so sign-up itself never
  // fails outright — the user can always pick a cleaner name afterwards
  // from their profile page.
  const baseName = (displayName || 'User').trim().slice(0, 40) || 'User';
  let attemptName = baseName;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: inserted, error: insErr } = await supabase
      .from('profiles')
      .insert({
        id:               userId,
        email,
        display_name:     attemptName,
        photo_url:        photoURL,
        custom_photo_url: null,
        bio:              '',
        location:         '',
        created_at:       now,
        updated_at:       now,
        last_seen:        now,
        is_online:        true,
        role:             isAdmin ? 'admin' : 'user',
        is_banned:        false,
        ban_reason:       null,
        banned_at:        null,
        watchlist_count:  0,
        watched_count:    0,
      })
      .select()
      .single();

    if (!insErr) return inserted as UserProfile;

    // 23505 = unique_violation. Only retry on a name collision — any
    // other error (network, RLS, etc.) should surface immediately.
    const isNameCollision = insErr.code === '23505' && insErr.message?.includes('display_name');
    if (!isNameCollision) throw insErr;

    attemptName = `${baseName}${Math.floor(1000 + Math.random() * 9000)}`;
  }

  throw new Error('Could not create a unique profile name after several attempts.');
};

/** Real-time availability check used by the profile name editor. */
export const checkDisplayNameAvailable = async (
  name: string,
  currentUserId: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_display_name_available', {
    p_name: name,
    p_user_id: currentUserId,
  });
  if (error) throw error;
  return Boolean(data);
};

export const setUserOnline = (uid: string) =>
  supabase.from('profiles').update({ is_online: true,  last_seen: new Date().toISOString() }).eq('id', uid);

export const setUserOffline = (uid: string) =>
  supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', uid);
