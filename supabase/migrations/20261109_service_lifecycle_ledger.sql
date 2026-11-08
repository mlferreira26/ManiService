-- Fluxo de conclusão sem pagamentos processados pelo ManiService.
-- Aplique no SQL Editor do Supabase antes de publicar a versão que usa estes campos.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS completion_image_url TEXT;

CREATE TABLE IF NOT EXISTS public.wallet_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  booking_id BIGINT REFERENCES public.bookings(id) ON DELETE SET NULL,
  entry_type VARCHAR(12) NOT NULL CHECK (entry_type IN ('receita', 'despesa')),
  description VARCHAR(240) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(40),
  report_source VARCHAR(24) NOT NULL DEFAULT 'lancamento_manual'
    CHECK (report_source IN ('cliente_confirmou', 'profissional_confirmou', 'lancamento_manual')),
  reported_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_entries_booking_income_idx
  ON public.wallet_entries (booking_id)
  WHERE entry_type = 'receita' AND booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_entries_user_date_idx
  ON public.wallet_entries (user_id, occurred_at DESC);

ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_entries FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.wallet_entries FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.wallet_entries FROM authenticated;
  END IF;
END $$;
