-- Ferramentas de moderação, recursos de contas bloqueadas e fila de denúncias arquivadas.
-- A aplicação também prepara essas estruturas na inicialização do servidor.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.report_events
  DROP CONSTRAINT IF EXISTS report_events_new_status_check;
ALTER TABLE public.report_events
  ADD CONSTRAINT report_events_new_status_check
  CHECK (new_status IN ('aberta', 'em_analise', 'resolvida', 'ignorada'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS moderation_hidden_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_blocked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_block_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_action_note TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS moderation_removed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.account_appeals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 3000),
  status VARCHAR(20) NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'em_analise', 'resolvida', 'negada')),
  admin_note TEXT,
  reviewed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_appeals_status_created_idx
  ON public.account_appeals (status, created_at ASC);
CREATE INDEX IF NOT EXISTS account_appeals_user_created_idx
  ON public.account_appeals (user_id, created_at DESC);

ALTER TABLE public.account_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_appeals FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.account_appeals FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.account_appeals FROM authenticated';
  END IF;
END $$;
