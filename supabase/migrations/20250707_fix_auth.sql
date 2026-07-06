-- Migration: Fix Auth Issues
-- Date: 2026-07-07
-- Description: Fix Google sign-in issues by creating missing RPC function,
-- ensuring RLS policies are correct, and creating storage bucket

-- ============================================================
-- 1. Create the is_display_name_available RPC function
-- ============================================================
CREATE OR REPLACE FUNCTION is_display_name_available(
    p_name TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Check if display name exists (excluding current user if updating)
    IF p_user_id IS NOT NULL THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM profiles 
            WHERE lower(display_name) = lower(p_name) 
            AND id != p_user_id
        ) INTO v_exists;
    ELSE
        SELECT NOT EXISTS (
            SELECT 1 FROM profiles 
            WHERE lower(display_name) = lower(p_name)
        ) INTO v_exists;
    END IF;
    
    RETURN v_exists;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION is_display_name_available(TEXT, UUID) TO anon, authenticated, service_role;

-- ============================================================
-- 2. Ensure RLS policies allow authenticated users to manage their profile
-- ============================================================

-- Enable RLS on profiles table (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;

-- Policy: Anyone can view profiles (needed for public pages)
CREATE POLICY "Users can view all profiles"
ON profiles FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Authenticated users can insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Policy: Authenticated users can update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy: Users can delete their own profile
CREATE POLICY "Users can delete their own profile"
ON profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- ============================================================
-- 3. Ensure storage bucket for profile images exists
-- ============================================================

-- Note: Storage buckets need to be created via the Supabase dashboard or storage API
-- The following is a placeholder for documentation purposes

/*
To create the storage bucket for profile images:

1. Go to Supabase Dashboard > Storage
2. Click "New Bucket"
3. Name: profile-images
4. Check "Public bucket"
5. Click "Save"

Then add the following RLS policies for the bucket:

-- Allow authenticated users to upload their own profile images
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view profile images
CREATE POLICY "Anyone can view profile images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'profile-images');

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update their own images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profile-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
*/

-- ============================================================
-- 4. Add indexes for performance
-- ============================================================

-- Index on display_name for case-insensitive lookups
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_lower 
ON profiles (lower(display_name));

-- Index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON profiles (email);

-- Index on role for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_role 
ON profiles (role);

-- ============================================================
-- 5. Verify the setup
-- ============================================================

-- Check if the function was created
SELECT 
    proname AS function_name,
    proargnames AS argument_names,
    proargtypes::regtype[] AS argument_types
FROM pg_proc
WHERE proname = 'is_display_name_available';
