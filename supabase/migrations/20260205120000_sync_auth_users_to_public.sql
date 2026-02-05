-- Migration: Sync auth.users to public.users
-- Purpose: Keep public.users in sync with auth.users for PostgREST access

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trg_auth_users__ai__sync_to_public ON auth.users;
DROP TRIGGER IF EXISTS trg_auth_users__au__sync_to_public ON auth.users;
DROP TRIGGER IF EXISTS trg_auth_users__ad__sync_to_public ON auth.users;

-- Function to sync auth.users to public.users on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.trgfn_auth_users__sync_to_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On INSERT or UPDATE, upsert into public.users
  INSERT INTO public.users (id, username, full_name, avatar_url, updated_at)
  VALUES (
    NEW.id,
    NEW.email, -- Use email as username fallback
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.updated_at
  )
  ON CONFLICT (id)
  DO UPDATE SET
    username = COALESCE(EXCLUDED.username, users.username),
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    avatar_url = EXCLUDED.avatar_url,
    updated_at = EXCLUDED.updated_at;
  
  RETURN NEW;
END;
$$;

-- Function to handle DELETE
CREATE OR REPLACE FUNCTION public.trgfn_auth_users__delete_from_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- Create triggers on auth.users
CREATE TRIGGER trg_auth_users__ai__sync_to_public
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_auth_users__sync_to_public();

CREATE TRIGGER trg_auth_users__au__sync_to_public
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_auth_users__sync_to_public();

CREATE TRIGGER trg_auth_users__ad__sync_to_public
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_auth_users__delete_from_public();

-- Initial sync: Copy all existing auth.users to public.users
INSERT INTO public.users (id, username, full_name, avatar_url, updated_at)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  raw_user_meta_data->>'avatar_url',
  updated_at
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  full_name = EXCLUDED.full_name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = EXCLUDED.updated_at;

COMMENT ON FUNCTION public.trgfn_auth_users__sync_to_public() IS
'Synchronizes auth.users INSERT/UPDATE to public.users for PostgREST access.';

COMMENT ON FUNCTION public.trgfn_auth_users__delete_from_public() IS
'Synchronizes auth.users DELETE to public.users.';
