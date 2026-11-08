-- Keep internal moderation history inaccessible to browser Supabase keys.
ALTER TABLE public.report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.report_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.report_events FROM authenticated';
  END IF;

  -- This view is not used by the app. Make it private and avoid owner privileges.
  IF to_regclass('public.professional_profile_summary') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.professional_profile_summary SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON TABLE public.professional_profile_summary FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON TABLE public.professional_profile_summary FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON TABLE public.professional_profile_summary FROM authenticated';
    END IF;
  END IF;
END $$;
