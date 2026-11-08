-- =========================================================
-- Mani Service - Schema PostgreSQL
-- =========================================================
-- Este arquivo cria a estrutura principal da aplicação.
-- As senhas devem ser armazenadas somente como hashes gerados
-- pelo backend (bcrypt/argon2), nunca em texto puro.
-- =========================================================

BEGIN;

-- Extensões úteis para UUIDs e busca textual. UUID pode ser adotado
-- progressivamente; as chaves atuais usam BIGSERIAL para manter
-- compatibilidade simples com o projeto existente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- Função genérica para updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Usuários e perfis
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'usuario'
    CHECK (role IN ('usuario', 'profissional', 'admin')),
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email));

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_active_idx ON users (is_active);

CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  address_line VARCHAR(255),
  neighborhood VARCHAR(120),
  city VARCHAR(120),
  state VARCHAR(2),
  postal_code VARCHAR(12),
  avatar_url TEXT,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_city_state_idx
  ON profiles (city, state);

-- Preferências de privacidade, busca regional e alertas.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_radius_km INTEGER NOT NULL DEFAULT 25;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_local_requests BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS profiles_location_idx ON profiles (latitude, longitude);

CREATE TABLE IF NOT EXISTS professional_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialty VARCHAR(160) NOT NULL,
  description TEXT,
  service_radius_km INTEGER CHECK (service_radius_km IS NULL OR service_radius_km > 0),
  hourly_rate NUMERIC(12,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  total_reviews INTEGER NOT NULL DEFAULT 0 CHECK (total_reviews >= 0),
  total_services INTEGER NOT NULL DEFAULT 0 CHECK (total_services >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS professional_profiles_specialty_idx
  ON professional_profiles (specialty);
CREATE INDEX IF NOT EXISTS professional_profiles_rating_idx
  ON professional_profiles (rating DESC);
CREATE INDEX IF NOT EXISTS professional_profiles_verified_idx
  ON professional_profiles (verified);

-- =========================================================
-- Seguidores e publicações da linha do tempo
-- =========================================================
CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_idx ON follows (following_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows (follower_id);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'publico'
    CHECK (visibility IN ('publico', 'seguidores', 'privado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_user_created_idx
  ON posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_visibility_idx ON posts (visibility);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes (user_id);

CREATE TABLE IF NOT EXISTS post_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
  ON post_comments (post_id, created_at ASC);

-- =========================================================
-- Pedidos/comunidades de serviço
-- =========================================================
CREATE TABLE IF NOT EXISTS service_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(255),
  city VARCHAR(120),
  state VARCHAR(2),
  image_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_analise', 'em_execucao', 'concluido', 'cancelado')),
  preferred_date DATE,
  budget_min NUMERIC(12,2) CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max NUMERIC(12,2) CHECK (budget_max IS NULL OR budget_max >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min)
);

CREATE INDEX IF NOT EXISTS service_requests_status_created_idx
  ON service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_category_idx
  ON service_requests (category);
CREATE INDEX IF NOT EXISTS service_requests_location_idx
  ON service_requests (city, state);
CREATE INDEX IF NOT EXISTS service_requests_user_idx
  ON service_requests (user_id);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS service_request_interests (
  request_id BIGINT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS request_interests_user_idx
  ON service_request_interests (user_id);

-- =========================================================
-- Propostas privadas e mensagens
-- =========================================================
CREATE TABLE IF NOT EXISTS proposals (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  message TEXT NOT NULL,
  estimated_days INTEGER CHECK (estimated_days IS NULL OR estimated_days > 0),
  available_start_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'enviado'
    CHECK (status IN ('enviado', 'visualizado', 'aceito', 'recusado', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, professional_id)
);

CREATE INDEX IF NOT EXISTS proposals_request_idx
  ON proposals (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_professional_idx
  ON proposals (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals (status);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT REFERENCES service_requests(id) ON DELETE SET NULL,
  proposal_id BIGINT UNIQUE REFERENCES proposals(id) ON DELETE SET NULL,
  customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (customer_id <> professional_id)
);

CREATE INDEX IF NOT EXISTS conversations_customer_idx
  ON conversations (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_professional_idx
  ON conversations (professional_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(body)) > 0),
  attachment_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- =========================================================
-- Serviços contratados, avaliações e denúncias
-- =========================================================
CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT REFERENCES service_requests(id) ON DELETE SET NULL,
  proposal_id BIGINT UNIQUE REFERENCES proposals(id) ON DELETE SET NULL,
  customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ,
  estimated_days INTEGER CHECK (estimated_days IS NULL OR estimated_days > 0),
  arrival_status VARCHAR(20) NOT NULL DEFAULT 'agendado'
    CHECK (arrival_status IN ('agendado', 'a_caminho', 'cheguei')),
  professional_completed_at TIMESTAMPTZ,
  customer_confirmed_at TIMESTAMPTZ,
  final_amount NUMERIC(12,2),
  completion_image_url TEXT,
  payment_status VARCHAR(24) NOT NULL DEFAULT 'nao_iniciado'
    CHECK (payment_status IN ('nao_iniciado', 'aguardando_integracao', 'pendente', 'pago', 'problema', 'reembolsado')),
  issue_details TEXT,
  issue_reported_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  issue_review_status VARCHAR(20) NOT NULL DEFAULT 'aberta'
    CHECK (issue_review_status IN ('aberta', 'em_analise', 'resolvida', 'ignorada')),
  issue_review_note TEXT,
  issue_reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  issue_reviewed_at TIMESTAMPTZ,
  agreed_amount NUMERIC(12,2) NOT NULL CHECK (agreed_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'em_execucao', 'aguardando_confirmacao', 'concluido', 'em_disputa', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (customer_id <> professional_id)
);

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS available_start_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_days INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_status VARCHAR(20) NOT NULL DEFAULT 'agendado';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS professional_completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_image_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) NOT NULL DEFAULT 'nao_iniciado';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_details TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_reported_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_review_status VARCHAR(20) NOT NULL DEFAULT 'aberta';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_review_note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_reviewed_at TIMESTAMPTZ;

-- Configuração financeira e trilha de pagamentos. Registra estados/valores; não guarda saldo nem custodia fundos.
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(80) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (key, value) VALUES ('commission_rate_percent', '8'::jsonb)
  ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON payment_transactions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS service_reminders (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  label VARCHAR(20) NOT NULL CHECK (label IN ('24_horas', '1_hora', 'fim_24_horas')),
  notified_at TIMESTAMPTZ,
  UNIQUE (booking_id, label)
);
ALTER TABLE service_reminders DROP CONSTRAINT IF EXISTS service_reminders_label_check;
ALTER TABLE service_reminders ADD CONSTRAINT service_reminders_label_check
  CHECK (label IN ('24_horas', '1_hora', 'fim_24_horas'));
CREATE INDEX IF NOT EXISTS service_reminders_due_idx ON service_reminders (remind_at) WHERE notified_at IS NULL;

-- Controle particular do profissional; registra valores declarados, sem processar pagamentos.
CREATE TABLE IF NOT EXISTS wallet_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  entry_type VARCHAR(12) NOT NULL CHECK (entry_type IN ('receita', 'despesa')),
  description VARCHAR(240) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(40),
  report_source VARCHAR(24) NOT NULL DEFAULT 'lancamento_manual'
    CHECK (report_source IN ('cliente_confirmou', 'profissional_confirmou', 'lancamento_manual')),
  reported_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_entries_booking_income_idx
  ON wallet_entries (booking_id) WHERE entry_type = 'receita' AND booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_entries_user_date_idx ON wallet_entries (user_id, occurred_at DESC);
ALTER TABLE wallet_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wallet_entries FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE wallet_entries FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE wallet_entries FROM authenticated;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bookings_customer_idx
  ON bookings (customer_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS bookings_professional_idx
  ON bookings (professional_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  reviewer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id BIGINT UNIQUE REFERENCES bookings(id) ON DELETE SET NULL,
  request_id BIGINT REFERENCES service_requests(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewer_id <> professional_id)
);

CREATE INDEX IF NOT EXISTS reviews_professional_created_idx
  ON reviews (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews (rating);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  request_id BIGINT REFERENCES service_requests(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
  reason VARCHAR(120) NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'em_analise', 'resolvida', 'ignorada')),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reported_user_id IS NOT NULL OR post_id IS NOT NULL OR request_id IS NOT NULL OR message_id IS NOT NULL)
);

-- Migração idempotente para bancos que já possuíam a tabela reports.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_check;
ALTER TABLE reports ADD CONSTRAINT reports_check CHECK (
  reported_user_id IS NOT NULL OR post_id IS NOT NULL OR request_id IS NOT NULL OR message_id IS NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_status_created_idx
  ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_message_idx ON reports (message_id) WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS report_events (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  moderator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_status VARCHAR(20) NOT NULL,
  new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('em_analise', 'resolvida', 'ignorada')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_events_report_created_idx
  ON report_events (report_id, created_at ASC);

ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE report_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE report_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE report_events FROM authenticated';
  END IF;
END $$;

-- =========================================================
-- Notificações e sessões
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, expires_at DESC);

-- =========================================================
-- Triggers de atualização
-- =========================================================
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS professional_profiles_set_updated_at ON professional_profiles;
CREATE TRIGGER professional_profiles_set_updated_at
BEFORE UPDATE ON professional_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS posts_set_updated_at ON posts;
CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS post_comments_set_updated_at ON post_comments;
CREATE TRIGGER post_comments_set_updated_at
BEFORE UPDATE ON post_comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS service_requests_set_updated_at ON service_requests;
CREATE TRIGGER service_requests_set_updated_at
BEFORE UPDATE ON service_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS proposals_set_updated_at ON proposals;
CREATE TRIGGER proposals_set_updated_at
BEFORE UPDATE ON proposals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS conversations_set_updated_at ON conversations;
CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS bookings_set_updated_at ON bookings;
CREATE TRIGGER bookings_set_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- Views úteis para leitura do perfil profissional
-- =========================================================
CREATE OR REPLACE VIEW professional_profile_summary WITH (security_invoker = true) AS
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  u.is_active,
  p.avatar_url,
  p.cover_url,
  p.bio,
  p.address_line,
  p.neighborhood,
  p.city,
  p.state,
  pp.specialty,
  pp.verified,
  COALESCE(AVG(r.rating), 0)::NUMERIC(2,1) AS calculated_rating,
  COUNT(DISTINCT r.id)::INTEGER AS calculated_reviews,
  COUNT(DISTINCT f.follower_id)::INTEGER AS followers_count,
  COUNT(DISTINCT po.id)::INTEGER AS posts_count
FROM users u
JOIN profiles p ON p.user_id = u.id
JOIN professional_profiles pp ON pp.user_id = u.id
LEFT JOIN reviews r ON r.professional_id = u.id
LEFT JOIN follows f ON f.following_id = u.id
LEFT JOIN posts po ON po.user_id = u.id
WHERE u.role = 'profissional'
GROUP BY
  u.id, u.name, u.email, u.is_active,
  p.avatar_url, p.cover_url, p.bio, p.address_line,
  p.neighborhood, p.city, p.state,
  pp.specialty, pp.verified;

REVOKE ALL ON TABLE professional_profile_summary FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE professional_profile_summary FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE professional_profile_summary FROM authenticated';
  END IF;
END $$;

-- =========================================================
-- Usuário administrador inicial opcional
-- =========================================================
-- Não descomente sem substituir o hash por um hash real gerado no backend.
-- Administradores não são criados pelo cadastro público.
--
-- INSERT INTO users (name, email, password_hash, role)
-- VALUES ('Administrador', 'admin@maniservice.com', '<BCRYPT_HASH>', 'admin');

COMMIT;

-- =========================================================
-- Comandos úteis
-- =========================================================
-- Aplicar localmente:
--   psql "$DATABASE_URL" -f pgadm.sql
--
-- Verificar tabelas:
--   \dt
--
-- Verificar conexão pelo backend:
--   GET /api/health
-- =========================================================
