-- Migration: Auto-set created_by for complaint timeline entries
-- Purpose: Automatically populate created_by with auth.uid() on INSERT

CREATE OR REPLACE FUNCTION public.trgfn_app_complaint_timeline__bi__set_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set created_by to current user if not already set
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trgfn_app_complaint_timeline__bi__set_created_by() IS
'Automatically sets created_by to auth.uid() on INSERT if not provided.';

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trg_app_complaint_timeline__bi__set_created_by ON public.app_complaint_timeline;

-- Create trigger
CREATE TRIGGER trg_app_complaint_timeline__bi__set_created_by
  BEFORE INSERT
  ON public.app_complaint_timeline
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_app_complaint_timeline__bi__set_created_by();

COMMENT ON TRIGGER trg_app_complaint_timeline__bi__set_created_by ON public.app_complaint_timeline IS
'Sets created_by to current authenticated user on INSERT.';
