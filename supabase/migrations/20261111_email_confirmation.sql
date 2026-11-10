CREATE TABLE IF NOT EXISTS public.pending_registrations (
  email TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  registration JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_registrations FROM PUBLIC, anon, authenticated;
