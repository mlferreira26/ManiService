-- ManiService: agendamento, acompanhamento e base para extrato de pagamentos.
-- Aplique no SQL Editor do Supabase antes de publicar a versão que usa estes campos.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS available_start_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS estimated_days INTEGER,
  ADD COLUMN IF NOT EXISTS arrival_status VARCHAR(20) NOT NULL DEFAULT 'agendado',
  ADD COLUMN IF NOT EXISTS professional_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_image_url TEXT,
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) NOT NULL DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS issue_details TEXT,
  ADD COLUMN IF NOT EXISTS issue_reported_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_review_status VARCHAR(20) NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS issue_review_note TEXT,
  ADD COLUMN IF NOT EXISTS issue_reviewed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_reviewed_at TIMESTAMPTZ;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_arrival_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_arrival_status_check
  CHECK (arrival_status IN ('agendado', 'a_caminho', 'cheguei'));
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('nao_iniciado', 'aguardando_integracao', 'pendente', 'pago', 'problema', 'reembolsado'));
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_issue_review_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_issue_review_status_check
  CHECK (issue_review_status IN ('aberta', 'em_analise', 'resolvida', 'ignorada'));
ALTER TABLE public.bookings ALTER COLUMN status TYPE VARCHAR(32);
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('agendado', 'em_execucao', 'aguardando_confirmacao', 'concluido', 'em_disputa', 'cancelado'));

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key VARCHAR(80) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.platform_settings (key, value)
VALUES ('commission_rate_percent', '8'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Este registro é um extrato de transações confirmadas pelo provedor, não uma carteira custodial.
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL DEFAULT 'mercado_pago',
  provider_payment_id VARCHAR(180) UNIQUE,
  gross_amount NUMERIC(12,2) NOT NULL CHECK (gross_amount >= 0),
  commission_rate NUMERIC(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  platform_fee NUMERIC(12,2) NOT NULL CHECK (platform_fee >= 0),
  processing_fee NUMERIC(12,2) CHECK (processing_fee IS NULL OR processing_fee >= 0),
  professional_net NUMERIC(12,2) CHECK (professional_net IS NULL OR professional_net >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'aguardando_integracao'
    CHECK (status IN ('aguardando_integracao', 'pendente', 'pago', 'falhou', 'reembolsado', 'em_disputa')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx
  ON public.payment_transactions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.service_reminders (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  label VARCHAR(20) NOT NULL CHECK (label IN ('24_horas', '1_hora', 'fim_24_horas')),
  notified_at TIMESTAMPTZ,
  UNIQUE (booking_id, label)
);
ALTER TABLE public.service_reminders DROP CONSTRAINT IF EXISTS service_reminders_label_check;
ALTER TABLE public.service_reminders ADD CONSTRAINT service_reminders_label_check
  CHECK (label IN ('24_horas', '1_hora', 'fim_24_horas'));
CREATE INDEX IF NOT EXISTS service_reminders_due_idx
  ON public.service_reminders (remind_at) WHERE notified_at IS NULL;
