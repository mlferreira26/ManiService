import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import dotenv from "dotenv";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

dotenv.config();

const scrypt = promisify(scryptCallback);
const app = express();
const server = createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production";
const isHttps = process.env.PUBLIC_HTTPS === "true";
const port = Number(process.env.PORT || 4000);
const sessionCookieName = "app_session_id";
const sessionSecret = process.env.SESSION_SECRET || "development-only-change-this-session-secret";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase") || process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

function jsonError(res: Response, status: number, error: string) {
  return res.status(status).json({ error });
}

function getCookie(req: Request, name: string) {
  const header = req.headers.cookie || "";
  const match = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function cookieOptions(maxAge: number) {
  const secure = isHttps ? "; Secure" : "";
  return `${sessionCookieName}=; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=${isHttps ? "None" : "Lax"}${secure}`;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function safeUser(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

async function getCurrentUser(req: Request) {
  const sessionId = getCookie(req, sessionCookieName);
  if (!sessionId) return null;
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = TRUE`,
    [sessionId],
  );
  return result.rows[0] || null;
}

async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return jsonError(res, 401, "Você precisa estar conectado.");
    res.locals.user = user;
    next();
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível validar a sessão.");
  }
}

async function requireProfessional(req: Request, res: Response, next: NextFunction) {
  await requireUser(req, res, () => {
    if (res.locals.user.role !== "profissional") return jsonError(res, 403, "Apenas profissionais podem executar esta ação.");
    next();
  });
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireUser(req, res, () => {
    if (res.locals.user.role !== "admin") return jsonError(res, 403, "Apenas a equipe de moderação pode acessar esta área.");
    next();
  });
}

async function notifyUser(userId: number | string, type: string, title: string, body: string, link: string) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, body, link],
  );
}

app.get("/api/notifications", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [res.locals.user.id],
    );
    res.json({ notifications: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar as notificações."); }
});

app.post("/api/notifications/:id/read", requireUser, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2", [req.params.id, res.locals.user.id]);
    res.json({ ok: true });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível atualizar a notificação."); }
});

app.post("/api/notifications/read-all", requireUser, async (_req, res) => {
  try {
    await pool.query("UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL", [res.locals.user.id]);
    res.json({ ok: true });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível atualizar as notificações."); }
});

const reportReasons = ["Suspeita de golpe ou fraude", "Pedido de pagamento fora da plataforma", "Perfil ou identidade falsa", "Assédio, ameaça ou discriminação", "Spam ou anúncio enganoso", "Conteúdo impróprio", "Outro"];
app.post("/api/reports", requireUser, async (req, res) => {
  const targetType = String(req.body?.targetType || "");
  const targetId = Number(req.body?.targetId);
  const reason = String(req.body?.reason || "");
  const details = String(req.body?.details || "").trim();
  if (!["profile", "post", "request", "message"].includes(targetType) || !Number.isInteger(targetId) || targetId < 1 || !reportReasons.includes(reason)) return jsonError(res, 400, "Selecione o item e o motivo da denúncia.");
  if (details.length > 2000) return jsonError(res, 400, "Os detalhes devem ter até 2.000 caracteres.");
  try {
    let targetUserId: number | null = null;
    if (targetType === "profile") {
      const target = await pool.query("SELECT id FROM users WHERE id = $1 AND is_active = TRUE", [targetId]);
      if (!target.rows[0] || targetId === Number(res.locals.user.id)) return jsonError(res, 404, "Perfil indisponível para denúncia.");
      targetUserId = targetId;
    } else if (targetType === "post") {
      const target = await pool.query("SELECT po.user_id FROM posts po JOIN profiles p ON p.user_id = po.user_id WHERE po.id = $1 AND (po.visibility = 'publico' AND p.is_public = TRUE OR po.user_id = $2)", [targetId, res.locals.user.id]);
      if (!target.rows[0] || Number(target.rows[0].user_id) === Number(res.locals.user.id)) return jsonError(res, 404, "Publicação indisponível para denúncia.");
      targetUserId = target.rows[0].user_id;
    } else if (targetType === "request") {
      const target = await pool.query("SELECT user_id FROM service_requests WHERE id = $1 AND status IN ('aberto', 'em_analise')", [targetId]);
      if (!target.rows[0] || Number(target.rows[0].user_id) === Number(res.locals.user.id)) return jsonError(res, 404, "Pedido indisponível para denúncia.");
      targetUserId = target.rows[0].user_id;
    } else {
      const target = await pool.query("SELECT sender_id FROM messages WHERE id = $1 AND sender_id <> $2 AND conversation_id IN (SELECT id FROM conversations WHERE customer_id = $2 OR professional_id = $2)", [targetId, res.locals.user.id]);
      if (!target.rows[0]) return jsonError(res, 404, "Mensagem indisponível para denúncia.");
      targetUserId = target.rows[0].sender_id;
    }
    const existing = await pool.query(
      `SELECT id FROM reports WHERE reporter_id = $1 AND status IN ('aberta','em_analise')
       AND reported_user_id IS NOT DISTINCT FROM $2 AND post_id IS NOT DISTINCT FROM $3
       AND request_id IS NOT DISTINCT FROM $4 AND message_id IS NOT DISTINCT FROM $5 LIMIT 1`,
      [res.locals.user.id, targetType === "profile" || targetType === "message" ? targetUserId : null, targetType === "post" ? targetId : null, targetType === "request" ? targetId : null, targetType === "message" ? targetId : null],
    );
    if (existing.rows[0]) return res.status(409).json({ error: "Você já enviou uma denúncia sobre este item. A equipe está analisando." });
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, post_id, request_id, message_id, reason, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [res.locals.user.id, targetType === "profile" || targetType === "message" ? targetUserId : null, targetType === "post" ? targetId : null, targetType === "request" ? targetId : null, targetType === "message" ? targetId : null, reason, details || null],
    );
    res.status(201).json({ ok: true, message: "Denúncia recebida. A equipe do ManiService fará a análise com confidencialidade." });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível registrar a denúncia agora."); }
});

app.get("/api/admin/reports", requireAdmin, async (req, res) => {
  const status = String(req.query.status || "todas");
  if (!['todas', 'aberta', 'em_analise', 'resolvida', 'ignorada'].includes(status)) return jsonError(res, 400, "Filtro de status inválido.");
  try {
    const result = await pool.query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.reviewed_at, r.review_note,
        reporter.name AS reporter_name, subject.name AS reported_user_name,
        p.title AS post_title, p.description AS post_description,
        sr.title AS request_title, sr.description AS request_description,
        m.body AS message_body, m.attachment_url AS message_attachment_url,
        reviewer.name AS reviewer_name,
        COALESCE((SELECT json_agg(json_build_object(
          'previous_status', event.previous_status, 'status', event.new_status,
          'moderator_name', moderator.name, 'note', event.note, 'created_at', event.created_at
        ) ORDER BY event.created_at ASC)
        FROM report_events event JOIN users moderator ON moderator.id = event.moderator_id
        WHERE event.report_id = r.id), '[]'::json) AS events
       FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users subject ON subject.id = r.reported_user_id
       LEFT JOIN posts p ON p.id = r.post_id LEFT JOIN service_requests sr ON sr.id = r.request_id
       LEFT JOIN messages m ON m.id = r.message_id LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       WHERE ($1 = 'todas' OR r.status = $1) ORDER BY CASE r.status WHEN 'aberta' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END, r.created_at ASC LIMIT 200`, [status],
    );
    res.json({ reports: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar as denúncias."); }
});

app.patch("/api/admin/reports/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  const reviewNote = String(req.body?.reviewNote || "").trim();
  if (!Number.isInteger(id) || id < 1 || !["em_analise", "resolvida", "ignorada"].includes(status)) return jsonError(res, 400, "Atualização de denúncia inválida.");
  if (reviewNote.length > 2000) return jsonError(res, 400, "A anotação deve ter até 2.000 caracteres.");
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM reports WHERE id = $1 FOR UPDATE", [id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 404, "Denúncia não encontrada."); }
    const result = await client.query(
      `UPDATE reports SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE id = $1 RETURNING id, status, review_note, reviewed_at`, [id, status, reviewNote || null, res.locals.user.id],
    );
    await client.query(
      `INSERT INTO report_events (report_id, moderator_id, previous_status, new_status, note)
       VALUES ($1, $2, $3, $4, $5)`, [id, res.locals.user.id, current.rows[0].status, status, reviewNote || null],
    );
    await client.query("COMMIT");
    res.json({ report: result.rows[0] });
  } catch (error) { if (client) await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível atualizar a denúncia."); }
  finally { client?.release(); }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const role = String(req.query.role || "todos");
  const active = String(req.query.active || "todos");
  const requestedOffset = Number(req.query.offset || 0);
  if (search.length > 100 || !["todos", "usuario", "profissional", "admin"].includes(role) || !["todos", "ativos", "inativos"].includes(active)) return jsonError(res, 400, "Filtro de contas inválido.");
  if (!Number.isInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 100000) return jsonError(res, 400, "Página inválida.");
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at,
        p.city, p.state, COUNT(*) OVER()::int AS total_count
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
         AND ($2 = 'todos' OR u.role = $2)
         AND ($3 = 'todos' OR ($3 = 'ativos' AND u.is_active = TRUE) OR ($3 = 'inativos' AND u.is_active = FALSE))
       ORDER BY u.created_at DESC, u.id DESC LIMIT 50 OFFSET $4`,
      [search, role, active, requestedOffset],
    );
    res.json({ users: result.rows.map(({ total_count: _totalCount, ...user }) => user), total: Number(result.rows[0]?.total_count || 0), offset: requestedOffset, limit: 50 });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar a lista de contas."); }
});

app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) return jsonError(res, 400, "Conta inválida.");
  try {
    const accountResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login_at,
        p.avatar_url, p.cover_url, p.bio, p.neighborhood, p.city, p.state, p.is_public,
        pp.specialty, pp.description AS professional_description, pp.verified, pp.rating,
        pp.total_reviews, pp.total_services,
        (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN professional_profiles pp ON pp.user_id = u.id
       WHERE u.id = $1`, [userId],
    );
    const account = accountResult.rows[0];
    if (!account) return jsonError(res, 404, "Conta não encontrada.");
    const [postsResult, reviewsResult] = await Promise.all([
      pool.query(
        `SELECT po.id, po.title, po.description, po.image_url, po.visibility, po.created_at,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = po.id) AS likes_count,
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = po.id) AS comments_count
         FROM posts po WHERE po.user_id = $1 ORDER BY po.created_at DESC LIMIT 50`, [userId],
      ),
      pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS reviewer_name
         FROM reviews r JOIN users u ON u.id = r.reviewer_id
         WHERE r.professional_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [userId],
      ),
    ]);
    res.json({ account, posts: postsResult.rows, reviews: reviewsResult.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar o perfil da conta."); }
});

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", time: result.rows[0].now, database: "connected" });
  } catch (error) {
    console.error(error);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role, specialty } = req.body || {};
  if (!name || !email || !password || !["usuario", "profissional"].includes(role)) return jsonError(res, 400, "Nome, e-mail, senha e perfil são obrigatórios.");
  if (String(password).length < 8) return jsonError(res, 400, "A senha precisa ter pelo menos 8 caracteres.");
  const normalizedEmail = String(email).trim().toLowerCase();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const passwordHash = await hashPassword(String(password));
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
      [String(name).trim(), normalizedEmail, passwordHash, role],
    );
    const user = userResult.rows[0];
    await client.query("INSERT INTO profiles (user_id) VALUES ($1)", [user.id]);
    if (role === "profissional") {
      await client.query("INSERT INTO professional_profiles (user_id, specialty) VALUES ($1, $2)", [user.id, specialty || "Serviços gerais"]);
    }
    await client.query("COMMIT");
    const sessionId = randomUUID();
    await pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [sessionId, user.id]);
    res.setHeader("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(sessionId)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=${isHttps ? "None" : "Lax"}${isHttps ? "; Secure" : ""}`);
    res.status(201).json({ user: safeUser(user) });
  } catch (error: any) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") return jsonError(res, 409, "Este e-mail já está cadastrado.");
    if (error?.code === "42501") {
      console.error("Supabase negou a operação de cadastro. Verifique se DATABASE_URL usa o usuário postgres/owner e se as tabelas estão no schema public.", error);
      return jsonError(res, 500, "O banco de dados negou o cadastro. Confira as permissões do usuário DATABASE_URL e execute o schema no projeto Supabase.");
    }
    console.error(error);
    jsonError(res, 500, "Não foi possível criar a conta. Confira a conexão e as tabelas do banco de dados.");
  } finally {
    client?.release();
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return jsonError(res, 400, "Informe e-mail e senha.");
  try {
    const result = await pool.query("SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE", [String(email).trim()]);
    const user = result.rows[0];
    if (!user || !(await verifyPassword(String(password), user.password_hash))) return jsonError(res, 401, "E-mail ou senha inválidos.");
    const previousSessionId = getCookie(req, sessionCookieName);
    if (previousSessionId) await pool.query("DELETE FROM sessions WHERE id = $1", [previousSessionId]);
    const sessionId = randomUUID();
    await pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [sessionId, user.id]);
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    res.setHeader("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(sessionId)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=${isHttps ? "None" : "Lax"}${isHttps ? "; Secure" : ""}`);
    res.json({ user: safeUser(user) });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível entrar agora.");
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const sessionId = getCookie(req, sessionCookieName);
  if (sessionId) await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]).catch(() => undefined);
  res.setHeader("Set-Cookie", cookieOptions(0));
  res.json({ ok: true });
});

app.get("/api/auth/me", requireUser, (req, res) => res.json({ user: safeUser(res.locals.user) }));

app.post("/api/auth/change-password", requireUser, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 8) return jsonError(res, 400, "A nova senha precisa ter pelo menos 8 caracteres.");
  try {
    const account = await pool.query("SELECT password_hash FROM users WHERE id = $1", [res.locals.user.id]);
    if (!account.rows[0] || !(await verifyPassword(currentPassword, account.rows[0].password_hash))) return jsonError(res, 400, "A senha atual está incorreta.");
    const passwordHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [res.locals.user.id, passwordHash]);
    const sessionId = getCookie(req, sessionCookieName);
    await pool.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [res.locals.user.id, sessionId]);
    res.json({ ok: true, message: "Senha alterada. As outras sessões foram encerradas." });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível alterar a senha."); }
});

app.get("/api/account/settings", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.name, u.email, u.role, p.is_public, p.search_radius_km,
       p.latitude, p.longitude, p.notify_messages, p.notify_local_requests
       FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [res.locals.user.id],
    );
    if (!result.rows[0]) return jsonError(res, 404, "Configurações da conta não encontradas.");
    res.json({ settings: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar as configurações."); }
});

app.put("/api/account/settings", requireUser, async (req, res) => {
  const radius = Number(req.body?.searchRadiusKm);
  const latitude = req.body?.latitude == null ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude == null ? null : Number(req.body.longitude);
  if (!Number.isInteger(radius) || radius < 1 || radius > 300) return jsonError(res, 400, "Escolha um raio entre 1 e 300 km.");
  if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude != null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) return jsonError(res, 400, "A localização informada é inválida.");
  try {
    await pool.query(
      `UPDATE profiles SET is_public = $2, search_radius_km = $3, latitude = $4, longitude = $5,
       notify_messages = $6, notify_local_requests = $7 WHERE user_id = $1`,
      [res.locals.user.id, req.body?.isPublic === true, radius, latitude, longitude, req.body?.notifyMessages !== false, req.body?.notifyLocalRequests !== false],
    );
    res.json({ ok: true });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível salvar as configurações."); }
});

app.get("/api/profile", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.phone, p.bio, p.address_line,
        p.neighborhood, p.city, p.state, p.postal_code, p.avatar_url, p.cover_url,
        p.is_public, p.search_radius_km, p.latitude, p.longitude, p.notify_messages, p.notify_local_requests,
        (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
        (SELECT COUNT(*)::int FROM reviews r WHERE r.professional_id = u.id) AS reviews_count,
        pp.specialty, pp.description AS professional_description, pp.service_radius_km,
        pp.hourly_rate, pp.verified,
        COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r.professional_id = u.id), pp.rating, 0) AS rating,
        (SELECT COUNT(*)::int FROM reviews r WHERE r.professional_id = u.id) AS total_reviews,
        pp.total_services
       FROM users u JOIN profiles p ON p.user_id = u.id
       LEFT JOIN professional_profiles pp ON pp.user_id = u.id
       WHERE u.id = $1`, [res.locals.user.id],
    );
    if (!result.rows[0]) return jsonError(res, 404, "Perfil não encontrado.");
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível carregar seu perfil.");
  }
});

app.put("/api/profile", requireUser, async (req, res) => {
  const { name, phone, bio, addressLine, neighborhood, city, state, postalCode, avatarUrl, specialty, professionalDescription, serviceRadiusKm, hourlyRate } = req.body || {};
  if (!String(name || "").trim()) return jsonError(res, 400, "Informe seu nome.");
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE users SET name = $2, phone = $3 WHERE id = $1", [res.locals.user.id, String(name).trim(), phone || null]);
      await client.query(
        `UPDATE profiles SET bio = $2, address_line = $3, neighborhood = $4, city = $5,
         state = $6, postal_code = $7, avatar_url = $8 WHERE user_id = $1`,
        [res.locals.user.id, bio || null, addressLine || null, neighborhood || null, city || null, state || null, postalCode || null, avatarUrl || null],
      );
      if (res.locals.user.role === "profissional") {
        await client.query(
          `UPDATE professional_profiles SET specialty = $2, description = $3,
           service_radius_km = $4, hourly_rate = $5 WHERE user_id = $1`,
          [res.locals.user.id, specialty || "Serviços gerais", professionalDescription || null, serviceRadiusKm || null, hourlyRate || null],
        );
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.phone, p.bio, p.address_line, p.neighborhood,
       p.city, p.state, p.postal_code, p.avatar_url, p.cover_url, pp.specialty,
       pp.description AS professional_description, pp.service_radius_km, pp.hourly_rate,
       pp.verified, pp.rating, pp.total_reviews, pp.total_services
       FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN professional_profiles pp ON pp.user_id = u.id WHERE u.id = $1`,
      [res.locals.user.id],
    );
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível salvar seu perfil.");
  }
});

app.get("/api/profile/posts", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT po.id, po.title, po.description, po.image_url, po.visibility, po.created_at,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = po.id) AS likes_count,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = po.id) AS comments_count,
        EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = po.id AND pl.user_id = $2) AS liked_by_me
       FROM posts po WHERE po.user_id = $1 ORDER BY po.created_at DESC`,
      [res.locals.user.id, res.locals.user.id],
    );
    res.json({ posts: result.rows });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível carregar sua linha do tempo.");
  }
});

app.get("/api/feed", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM (
         SELECT 'publicacao'::text AS kind, po.id, po.title, po.description, po.image_url,
           po.created_at, u.id AS author_id, u.name AS author_name, u.role AS author_role,
           p.avatar_url, p.city, p.state,
           (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = po.id) AS likes_count,
           (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = po.id) AS comments_count,
           EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = po.id AND pl.user_id = $1) AS liked_by_me
         FROM posts po JOIN users u ON u.id = po.user_id JOIN profiles p ON p.user_id = u.id
         WHERE po.visibility = 'publico' AND p.is_public = TRUE AND u.is_active = TRUE
         UNION ALL
         SELECT 'pedido'::text AS kind, sr.id, sr.title, sr.description, sr.image_url,
           sr.created_at, u.id AS author_id, u.name AS author_name, u.role AS author_role,
           p.avatar_url, sr.city, sr.state, 0::int AS likes_count, 0::int AS comments_count, FALSE AS liked_by_me
         FROM service_requests sr JOIN users u ON u.id = sr.user_id JOIN profiles p ON p.user_id = u.id
         WHERE sr.status IN ('aberto', 'em_analise') AND p.is_public = TRUE AND u.is_active = TRUE
       ) activity ORDER BY created_at DESC LIMIT 60`,
      [res.locals.user.id],
    );
    res.json({ items: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar as atividades."); }
});

app.get("/api/users/search", requireUser, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const role = String(req.query.role || "todos");
  const city = String(req.query.city || "").trim();
  const requestedRadius = Number(req.query.radius || 0);
  if (search.length > 100 || city.length > 100 || !["todos", "usuario", "profissional"].includes(role)) return jsonError(res, 400, "Filtro de busca inválido.");
  if (requestedRadius && (!Number.isInteger(requestedRadius) || requestedRadius < 1 || requestedRadius > 300)) return jsonError(res, 400, "A distância de busca deve ficar entre 1 e 300 km.");
  try {
    const result = await pool.query(
      `WITH viewer AS (
         SELECT city, state, latitude, longitude, search_radius_km FROM profiles WHERE user_id = $1
       )
       SELECT u.id, u.name, CASE WHEN u.role = 'admin' THEN 'usuario' ELSE u.role END AS role,
         p.avatar_url, p.bio, p.city, p.state, p.latitude, p.longitude,
         pp.specialty, pp.verified, COALESCE(pp.rating, 0) AS rating,
         COALESCE(pp.total_reviews, 0) AS total_reviews, COALESCE(pp.total_services, 0) AS total_services,
         (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
         CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
           ROUND((6371 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
             POWER(SIN(RADIANS(p.latitude-v.latitude)/2), 2) + COS(RADIANS(v.latitude))*COS(RADIANS(p.latitude))*POWER(SIN(RADIANS(p.longitude-v.longitude)/2), 2)
           )))))::numeric, 1) ELSE NULL END AS distance_km
       FROM users u JOIN profiles p ON p.user_id = u.id CROSS JOIN viewer v
       LEFT JOIN professional_profiles pp ON pp.user_id = u.id
       WHERE u.is_active = TRUE AND p.is_public = TRUE AND u.id <> $1
         AND ($2 = '' OR u.name ILIKE '%' || $2 || '%' OR COALESCE(pp.specialty, '') ILIKE '%' || $2 || '%')
         AND ($3 = 'todos' OR ($3 = 'usuario' AND u.role IN ('usuario', 'admin')) OR ($3 = 'profissional' AND u.role = 'profissional'))
         AND ($4 = '' OR p.city ILIKE '%' || $4 || '%')
         AND (
           (v.latitude IS NOT NULL AND v.longitude IS NOT NULL AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
             AND 6371 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
               POWER(SIN(RADIANS(p.latitude-v.latitude)/2), 2) + COS(RADIANS(v.latitude))*COS(RADIANS(p.latitude))*POWER(SIN(RADIANS(p.longitude-v.longitude)/2), 2)
             )))) <= CASE WHEN $5 > 0 THEN $5 ELSE v.search_radius_km END)
           OR ((v.latitude IS NULL OR v.longitude IS NULL OR p.latitude IS NULL OR p.longitude IS NULL)
             AND LOWER(COALESCE(p.city,'')) = LOWER(COALESCE(v.city,''))
             AND LOWER(COALESCE(p.state,'')) = LOWER(COALESCE(v.state,'')) AND COALESCE(p.city,'') <> '')
           OR ($4 <> '' AND p.city ILIKE '%' || $4 || '%')
         )
       ORDER BY (u.role = 'profissional') DESC, pp.verified DESC NULLS LAST, pp.rating DESC NULLS LAST, u.name ASC LIMIT 100`,
      [res.locals.user.id, search, role, city, Number.isInteger(requestedRadius) ? requestedRadius : 0],
    );
    res.json({ users: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível pesquisar usuários."); }
});

app.post("/api/profile/posts", requireUser, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const imageUrl = String(req.body?.imageUrl || "").trim() || null;
  if (!title || !description) return jsonError(res, 400, "Informe um título e uma descrição para a publicação.");
  if (title.length > 180 || description.length > 10000) return jsonError(res, 400, "O título deve ter até 180 caracteres e o texto até 10.000.");
  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, title, description, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, description, image_url, visibility, created_at`,
      [res.locals.user.id, title, description, imageUrl],
    );
    res.status(201).json({ post: result.rows[0] });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível publicar na sua linha do tempo.");
  }
});

app.delete("/api/profile/posts/:id", requireUser, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId < 1) return jsonError(res, 400, "Publicação inválida.");
  try {
    const result = await pool.query("DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id", [postId, res.locals.user.id]);
    if (!result.rows[0]) return jsonError(res, 404, "Publicação não encontrada.");
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível excluir a publicação.");
  }
});

app.post("/api/posts/:id/reaction", requireUser, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId < 1) return jsonError(res, 400, "Publicação inválida.");
  try {
    const removed = await pool.query(
      `DELETE FROM post_likes pl USING posts po, profiles p
       WHERE pl.post_id = $1 AND pl.user_id = $2 AND po.id = pl.post_id AND p.user_id = po.user_id
       RETURNING pl.post_id`,
      [postId, res.locals.user.id],
    );
    let liked = false;
    if (!removed.rows[0]) {
      const added = await pool.query(
        `INSERT INTO post_likes (post_id, user_id)
         SELECT po.id, $2 FROM posts po JOIN profiles p ON p.user_id = po.user_id
         WHERE po.id = $1 AND po.visibility = 'publico' AND p.is_public = TRUE
         ON CONFLICT DO NOTHING RETURNING post_id`,
        [postId, res.locals.user.id],
      );
      if (!added.rows[0]) return jsonError(res, 404, "Publicação não encontrada ou indisponível.");
      liked = true;
      const owner = await pool.query("SELECT po.user_id, u.name FROM posts po JOIN users u ON u.id = po.user_id WHERE po.id = $1", [postId]);
      if (owner.rows[0]) await notifyUser(owner.rows[0].user_id, "post_reaction", "Nova reação", `${res.locals.user.name} reagiu à sua publicação.`, `/perfil/${owner.rows[0].user_id}`);
    }
    const count = await pool.query("SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1", [postId]);
    res.json({ liked, likesCount: Number(count.rows[0].count) });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível reagir à publicação."); }
});

app.get("/api/posts/:id/comments", requireUser, async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId < 1) return jsonError(res, 400, "Publicação inválida.");
  try {
    const post = await pool.query(
      `SELECT po.id FROM posts po JOIN profiles p ON p.user_id = po.user_id
       WHERE po.id = $1 AND (po.user_id = $2 OR (po.visibility = 'publico' AND p.is_public = TRUE))`,
      [postId, res.locals.user.id],
    );
    if (!post.rows[0]) return jsonError(res, 404, "Publicação não encontrada ou indisponível.");
    const result = await pool.query(
      `SELECT pc.id, pc.post_id, pc.user_id, pc.body, pc.created_at, u.name AS author_name, p.avatar_url AS author_avatar_url
       FROM post_comments pc JOIN users u ON u.id = pc.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE pc.post_id = $1 ORDER BY pc.created_at ASC LIMIT 200`,
      [postId],
    );
    res.json({ comments: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar os comentários."); }
});

app.post("/api/posts/:id/comments", requireUser, async (req, res) => {
  const postId = Number(req.params.id);
  const body = String(req.body?.body || "").trim();
  if (!Number.isInteger(postId) || postId < 1) return jsonError(res, 400, "Publicação inválida.");
  if (!body || body.length > 2000) return jsonError(res, 400, "O comentário deve ter entre 1 e 2.000 caracteres.");
  try {
    const result = await pool.query(
      `INSERT INTO post_comments (post_id, user_id, body)
       SELECT po.id, $2, $3 FROM posts po JOIN profiles p ON p.user_id = po.user_id
       WHERE po.id = $1 AND (po.user_id = $2 OR (po.visibility = 'publico' AND p.is_public = TRUE))
       RETURNING id, post_id, user_id, body, created_at`,
      [postId, res.locals.user.id, body],
    );
    if (!result.rows[0]) return jsonError(res, 404, "Publicação não encontrada ou indisponível.");
    const [author, count, commenter] = await Promise.all([
      pool.query("SELECT po.user_id FROM posts po WHERE po.id = $1", [postId]),
      pool.query("SELECT COUNT(*)::int AS count FROM post_comments WHERE post_id = $1", [postId]),
      pool.query("SELECT p.avatar_url FROM profiles p WHERE p.user_id = $1", [res.locals.user.id]),
    ]);
    const comment = { ...result.rows[0], author_name: res.locals.user.name, author_avatar_url: commenter.rows[0]?.avatar_url || null };
    if (author.rows[0] && Number(author.rows[0].user_id) !== Number(res.locals.user.id)) {
      await notifyUser(author.rows[0].user_id, "post_comment", "Novo comentário", `${res.locals.user.name} comentou na sua publicação.`, `/perfil/${author.rows[0].user_id}`);
    }
    res.status(201).json({ comment, commentsCount: Number(count.rows[0].count) });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível publicar o comentário."); }
});

app.get("/api/conversations", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.request_id, c.updated_at,
        CASE WHEN c.customer_id = $1 THEN c.professional_id ELSE c.customer_id END AS other_user_id,
        u.name AS other_user_name, u.role AS other_user_role, p.avatar_url AS other_user_avatar_url,
        lm.body AS last_message, lm.created_at AS last_message_at,
        (SELECT COUNT(*)::int FROM messages unread
         WHERE unread.conversation_id = c.id AND unread.sender_id <> $1 AND unread.read_at IS NULL) AS unread_count
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.customer_id = $1 THEN c.professional_id ELSE c.customer_id END
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN LATERAL (SELECT body, created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) lm ON TRUE
       WHERE c.customer_id = $1 OR c.professional_id = $1 ORDER BY COALESCE(lm.created_at, c.updated_at) DESC`,
      [res.locals.user.id],
    );
    res.json({ conversations: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar suas conversas."); }
});

app.post("/api/conversations", requireUser, async (req, res) => {
  const requestedProfessionalId = Number(req.body?.professionalId);
  const requestedCustomerId = Number(req.body?.customerId);
  const requestId = req.body?.requestId ? Number(req.body.requestId) : null;
  let customerId: number;
  let professionalId: number;
  if (res.locals.user.role === "usuario") {
    customerId = Number(res.locals.user.id);
    professionalId = requestedProfessionalId;
    if (!professionalId || professionalId === customerId) return jsonError(res, 400, "Selecione um profissional válido.");
  } else if (res.locals.user.role === "profissional") {
    customerId = requestedCustomerId;
    professionalId = Number(res.locals.user.id);
    if (!customerId || customerId === professionalId || !requestId) return jsonError(res, 400, "Selecione um pedido de consumidor para iniciar a conversa.");
  } else return jsonError(res, 403, "Sua conta não pode iniciar esta conversa.");
  try {
    const professional = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'profissional' AND is_active = TRUE", [professionalId]);
    if (!professional.rows[0]) return jsonError(res, 404, "Profissional não encontrado.");
    const customer = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'usuario' AND is_active = TRUE", [customerId]);
    if (!customer.rows[0]) return jsonError(res, 404, "Consumidor não encontrado.");
    if (res.locals.user.role === "profissional") {
      const serviceRequest = await pool.query("SELECT id FROM service_requests WHERE id = $1 AND user_id = $2 AND status IN ('aberto', 'em_analise')", [requestId, customerId]);
      if (!serviceRequest.rows[0]) return jsonError(res, 404, "Pedido não encontrado ou indisponível.");
    }
    const result = await pool.query(
      `WITH existing AS (
         SELECT id FROM conversations WHERE customer_id = $1 AND professional_id = $2
           AND request_id IS NOT DISTINCT FROM $3 ORDER BY id LIMIT 1
       ), inserted AS (
         INSERT INTO conversations (customer_id, professional_id, request_id)
         SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING id
       ) SELECT id FROM inserted UNION ALL SELECT id FROM existing`,
      [customerId, professionalId, requestId],
    );
    res.status(201).json({ conversation: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível iniciar a conversa."); }
});

app.get("/api/conversations/:id/messages", requireUser, async (req, res) => {
  try {
    const conversation = await pool.query("SELECT id FROM conversations WHERE id = $1 AND (customer_id = $2 OR professional_id = $2)", [req.params.id, res.locals.user.id]);
    if (!conversation.rows[0]) return jsonError(res, 404, "Conversa não encontrada.");
    const markedRead = await pool.query("UPDATE messages SET read_at = NOW() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL RETURNING id", [req.params.id, res.locals.user.id]);
    const result = await pool.query(
      `SELECT m.id, m.sender_id, u.name AS sender_name, m.body, m.attachment_url, m.created_at, m.read_at
       FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = $1 ORDER BY m.created_at ASC`, [req.params.id],
    );
    res.json({ messages: result.rows, markedRead: markedRead.rowCount || 0 });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar as mensagens."); }
});

app.post("/api/conversations/:id/messages", requireUser, async (req, res) => {
  const attachmentUrl = String(req.body?.attachmentUrl || "").trim() || null;
  const body = String(req.body?.body || "").trim() || (attachmentUrl ? "Foto" : "");
  if (!body) return jsonError(res, 400, "Digite uma mensagem ou anexe uma foto.");
  if (body.length > 5000) return jsonError(res, 400, "A mensagem deve ter até 5.000 caracteres.");
  try {
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, attachment_url)
       SELECT c.id, $2, $3, $4 FROM conversations c WHERE c.id = $1 AND (c.customer_id = $2 OR c.professional_id = $2)
       RETURNING id, conversation_id, sender_id, body, attachment_url, created_at, read_at`,
      [req.params.id, res.locals.user.id, body, attachmentUrl],
    );
    if (!result.rows[0]) return jsonError(res, 404, "Conversa não encontrada.");
    await pool.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [req.params.id]);
    const recipient = await pool.query(
      `SELECT CASE WHEN customer_id = $2 THEN professional_id ELSE customer_id END AS user_id
       FROM conversations WHERE id = $1`,
      [req.params.id, res.locals.user.id],
    );
    if (recipient.rows[0]) {
      const preferences = await pool.query("SELECT notify_messages FROM profiles WHERE user_id = $1", [recipient.rows[0].user_id]);
      if (preferences.rows[0]?.notify_messages !== false) await notifyUser(recipient.rows[0].user_id, "message", "Nova mensagem", `${res.locals.user.name} enviou uma mensagem.`, `/mensagens?conversation=${result.rows[0].conversation_id}`);
    }
    res.status(201).json({ message: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível enviar a mensagem."); }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return jsonError(res, 400, "Informe o e-mail da conta.");
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM;
  if (!resendApiKey || !mailFrom) return jsonError(res, 503, "A recuperação por e-mail ainda não está configurada. Avise o administrador do ManiService.");
  try {
    const result = await pool.query("SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE", [email]);
    // Keep the same successful response for known and unknown accounts.
    if (!result.rows[0]) return res.json({ ok: true, message: "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação." });
    const account = result.rows[0];
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(`${rawToken}:${sessionSecret}`).digest("hex");
    await pool.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [account.id]);
    await pool.query("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')", [account.id, tokenHash]);
    const appUrl = (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
    const resetUrl = `${appUrl}/login?resetToken=${rawToken}`;
    const htmlEscape: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    const safeName = String(account.name).replace(/[&<>"']/g, (character) => htmlEscape[character]);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mailFrom,
        to: [account.email],
        subject: "Redefina sua senha do ManiService",
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h1>Redefinir senha</h1><p>Olá, ${safeName}. Recebemos um pedido para redefinir a senha da sua conta ManiService.</p><p><a href="${resetUrl}" style="display:inline-block;background:#1748e8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Criar nova senha</a></p><p>O link expira em 30 minutos e pode ser usado uma única vez. Se você não pediu a redefinição, ignore este e-mail.</p></div>`,
      }),
    });
    if (!emailResponse.ok) {
      await pool.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1", [tokenHash]);
      console.error("Resend recusou o envio de recuperação de senha:", emailResponse.status, await emailResponse.text());
      return jsonError(res, 502, "Não foi possível enviar o e-mail agora. Confira a configuração de e-mail do ManiService.");
    }
    res.json({ ok: true, message: "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação." });
  } catch (error) {
    console.error("Falha no envio de recuperação de senha:", error);
    jsonError(res, 500, "Não foi possível enviar as instruções agora.");
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return jsonError(res, 400, "O link de redefinição é inválido ou expirou.");
  if (password.length < 8) return jsonError(res, 400, "A nova senha precisa ter pelo menos 8 caracteres.");
  const tokenHash = createHash("sha256").update(`${token}:${sessionSecret}`).digest("hex");
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const tokenResult = await client.query(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE",
      [tokenHash],
    );
    if (!tokenResult.rows[0]) {
      await client.query("ROLLBACK");
      return jsonError(res, 400, "O link de redefinição é inválido ou expirou. Solicite outro e-mail.");
    }
    const userId = tokenResult.rows[0].user_id;
    const passwordHash = await hashPassword(password);
    await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [userId]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Senha redefinida. Entre com sua nova senha." });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha ao redefinir senha:", error);
    jsonError(res, 500, "Não foi possível redefinir a senha agora.");
  } finally {
    client?.release();
  }
});

app.get("/api/service-requests", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT sr.*, u.name AS author,
        COUNT(DISTINCT sri.user_id)::int AS interested,
        COUNT(DISTINCT p.id)::int AS proposals_count
       FROM service_requests sr
       JOIN users u ON u.id = sr.user_id
       LEFT JOIN service_request_interests sri ON sri.request_id = sr.id
       LEFT JOIN proposals p ON p.request_id = sr.id
       GROUP BY sr.id, u.name
       ORDER BY sr.created_at DESC`,
    );
    res.json({ requests: result.rows });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível carregar os pedidos.");
  }
});

app.get("/api/professionals", async (req, res) => {
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "").trim();
  const city = String(req.query.city || "").trim();
  const minRating = Number(req.query.minRating || 0);
  const verified = req.query.verified === "true";
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, p.avatar_url, p.city, p.state, pp.specialty,
        pp.verified, pp.rating, pp.total_reviews, pp.total_services,
        COUNT(DISTINCT f.follower_id)::int AS followers_count
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       JOIN professional_profiles pp ON pp.user_id = u.id
       LEFT JOIN follows f ON f.following_id = u.id
       WHERE u.role = 'profissional' AND u.is_active = TRUE
         AND ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR pp.specialty ILIKE '%' || $1 || '%')
         AND ($2 = '' OR pp.specialty ILIKE '%' || $2 || '%')
         AND ($3 = '' OR p.city ILIKE '%' || $3 || '%')
         AND ($4 = 0 OR pp.rating >= $4)
         AND ($5 = FALSE OR pp.verified = TRUE)
       GROUP BY u.id, u.name, p.avatar_url, p.city, p.state, pp.specialty,
         pp.verified, pp.rating, pp.total_reviews, pp.total_services
       ORDER BY pp.verified DESC, pp.rating DESC, pp.total_reviews DESC, u.name ASC`,
      [search, category, city, minRating, verified],
    );
    res.json({ professionals: result.rows });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível pesquisar profissionais.");
  }
});

app.get("/api/professionals/:id/profile", requireUser, async (req, res) => {
  const professionalId = Number(req.params.id);
  if (!Number.isInteger(professionalId) || professionalId < 1) return jsonError(res, 400, "Perfil inválido.");
  try {
    const profileResult = await pool.query(
      `SELECT u.id, u.name, CASE WHEN u.role = 'admin' THEN 'usuario' ELSE u.role END AS role,
        p.avatar_url, p.cover_url, p.bio, p.neighborhood, p.city, p.state,
        p.is_public,
        pp.specialty, pp.description AS professional_description, pp.verified,
        COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r.professional_id = u.id), pp.rating, 0) AS rating,
        (SELECT COUNT(*)::int FROM reviews r WHERE r.professional_id = u.id) AS total_reviews,
        pp.total_services,
        (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
        EXISTS (SELECT 1 FROM reviews r WHERE r.reviewer_id = $2 AND r.professional_id = u.id) AS has_reviewed,
        EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id) AS is_following
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN professional_profiles pp ON pp.user_id = u.id
       WHERE u.id = $1 AND u.role IN ('profissional', 'usuario', 'admin')
         AND u.is_active = TRUE AND (p.is_public = TRUE OR u.id = $2)`,
      [professionalId, res.locals.user.id],
    );
    if (!profileResult.rows[0]) return jsonError(res, 404, "Perfil não encontrado.");
    const [posts, reviews] = await Promise.all([
      pool.query(
        `SELECT po.id, po.title, po.description, po.image_url, po.created_at,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = po.id) AS likes_count,
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = po.id) AS comments_count,
          EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = po.id AND pl.user_id = $2) AS liked_by_me
         FROM posts po WHERE po.user_id = $1 AND po.visibility = 'publico' ORDER BY po.created_at DESC`,
        [professionalId, res.locals.user.id],
      ),
      pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS reviewer_name
         FROM reviews r JOIN users u ON u.id = r.reviewer_id
         WHERE r.professional_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
        [professionalId],
      ),
    ]);
    res.json({ profile: profileResult.rows[0], posts: posts.rows, reviews: reviews.rows });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível carregar o perfil profissional.");
  }
});

app.post("/api/users/:id/follow", requireUser, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1 || targetId === Number(res.locals.user.id)) return jsonError(res, 400, "Não é possível seguir este perfil.");
  try {
    const target = await pool.query("SELECT id FROM users WHERE id = $1 AND is_active = TRUE", [targetId]);
    if (!target.rows[0]) return jsonError(res, 404, "Perfil não encontrado.");
    await pool.query("INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [res.locals.user.id, targetId]);
    res.json({ following: true });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível seguir este perfil."); }
});

app.delete("/api/users/:id/follow", requireUser, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1 || targetId === Number(res.locals.user.id)) return jsonError(res, 400, "Perfil inválido.");
  try {
    await pool.query("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", [res.locals.user.id, targetId]);
    res.json({ following: false });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível deixar de seguir este perfil."); }
});

app.post("/api/service-requests", requireUser, async (req, res) => {
  const { category, title, description, location, city, state, imageUrl, preferredDate, budgetMin, budgetMax } = req.body || {};
  const latitude = req.body?.latitude == null ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude == null ? null : Number(req.body.longitude);
  if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude != null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) return jsonError(res, 400, "A localização informada é inválida.");
  if (!category || !title || !description) return jsonError(res, 400, "Categoria, título e descrição são obrigatórios.");
  try {
    const result = await pool.query(
      `INSERT INTO service_requests (user_id, category, title, description, location, city, state, image_url, preferred_date, budget_min, budget_max, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [res.locals.user.id, category, title, description, location || null, city || null, state || null, imageUrl || null, preferredDate || null, budgetMin || null, budgetMax || null, latitude, longitude],
    );
    const matchingProfessionals = await pool.query(
      `SELECT DISTINCT u.id FROM users u
       JOIN profiles p ON p.user_id = u.id
       JOIN professional_profiles pp ON pp.user_id = u.id
       WHERE u.role = 'profissional' AND u.is_active = TRUE AND u.id <> $1
         AND p.notify_local_requests = TRUE
         AND (LOWER(pp.specialty) LIKE '%' || LOWER($2) || '%' OR LOWER($2) LIKE '%' || LOWER(pp.specialty) || '%' OR LOWER(pp.specialty) LIKE '%serviço geral%')
         AND (
           ($3::double precision IS NOT NULL AND $4::double precision IS NOT NULL AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
             AND 6371 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
               POWER(SIN(RADIANS(p.latitude-$3)/2), 2) + COS(RADIANS($3))*COS(RADIANS(p.latitude))*POWER(SIN(RADIANS(p.longitude-$4)/2), 2)
             )))) <= COALESCE(pp.service_radius_km, p.search_radius_km))
           OR (LOWER(COALESCE(p.city,'')) = LOWER(COALESCE($5,'')) AND LOWER(COALESCE(p.state,'')) = LOWER(COALESCE($6,'')) AND COALESCE($5,'') <> '')
         )`,
      [res.locals.user.id, category, result.rows[0].latitude ?? null, result.rows[0].longitude ?? null, city || null, state || null],
    );
    await Promise.all(matchingProfessionals.rows.map((professional) =>
      notifyUser(professional.id, "local_service", "Novo pedido na sua região", `${String(category)}: ${String(title)}`, "/comunidades"),
    ));
    res.status(201).json({ request: result.rows[0] });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível publicar o pedido.");
  }
});

app.delete("/api/service-requests/:id", requireUser, async (req, res) => {
  if (res.locals.user.role !== "usuario") return jsonError(res, 403, "Somente quem publicou o pedido pode removê-lo.");
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId < 1) return jsonError(res, 400, "Pedido inválido.");
  try {
    const result = await pool.query(
      `DELETE FROM service_requests sr
       WHERE sr.id = $1 AND sr.user_id = $2 AND sr.status IN ('aberto', 'em_analise')
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.request_id = sr.id AND b.status <> 'cancelado')
       RETURNING sr.id`,
      [requestId, res.locals.user.id],
    );
    if (!result.rows[0]) return jsonError(res, 409, "Este pedido não pode ser removido porque não está mais aberto ou já tem serviço contratado.");
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível remover o pedido.");
  }
});

app.post("/api/service-requests/:id/interest", requireProfessional, async (req, res) => {
  try {
    await pool.query("INSERT INTO service_request_interests (request_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.id, res.locals.user.id]);
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível registrar o interesse.");
  }
});

app.delete("/api/service-requests/:id", requireUser, async (req, res) => {
  if (res.locals.user.role !== "usuario") return jsonError(res, 403, "Somente quem publicou o pedido pode removê-lo.");
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId < 1) return jsonError(res, 400, "Pedido inválido.");
  try {
    const result = await pool.query(
      `DELETE FROM service_requests sr
       WHERE sr.id = $1 AND sr.user_id = $2 AND sr.status IN ('aberto', 'em_analise')
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.request_id = sr.id AND b.status <> 'cancelado')
       RETURNING sr.id`,
      [requestId, res.locals.user.id],
    );
    if (!result.rows[0]) return jsonError(res, 409, "Este pedido não pode ser removido. Confira se ainda está aberto e sem serviço contratado.");
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível remover o pedido.");
  }
});

app.post("/api/service-requests/:id/proposals", requireProfessional, async (req, res) => {
  const requestId = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const message = String(req.body?.message || "").trim();
  const estimatedDays = req.body?.estimatedDays ? Number(req.body.estimatedDays) : null;
  if (!Number.isInteger(requestId) || requestId < 1) return jsonError(res, 400, "Pedido inválido.");
  if (!Number.isFinite(amount) || amount <= 0 || !message) return jsonError(res, 400, "Informe um valor válido e uma mensagem.");
  if (message.length > 5000 || (estimatedDays !== null && (!Number.isInteger(estimatedDays) || estimatedDays < 1))) return jsonError(res, 400, "Confira a mensagem e o prazo informado.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT user_id, title FROM service_requests WHERE id = $1 AND status IN ('aberto', 'em_analise')", [requestId]);
    const serviceRequest = request.rows[0];
    if (!serviceRequest) { await client.query("ROLLBACK"); return jsonError(res, 404, "Pedido não encontrado ou indisponível."); }
    if (Number(serviceRequest.user_id) === Number(res.locals.user.id)) { await client.query("ROLLBACK"); return jsonError(res, 400, "Você não pode enviar proposta para seu próprio pedido."); }
    const result = await client.query(
      `INSERT INTO proposals (request_id, professional_id, amount, message, estimated_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (request_id, professional_id)
       DO UPDATE SET amount = EXCLUDED.amount, message = EXCLUDED.message, estimated_days = EXCLUDED.estimated_days, status = 'enviado', updated_at = NOW()
       RETURNING *`,
      [requestId, res.locals.user.id, amount, message, estimatedDays],
    );
    const conversationResult = await client.query(
      `WITH existing AS (
         SELECT id FROM conversations WHERE customer_id = $1 AND professional_id = $2 AND request_id = $3 ORDER BY id LIMIT 1
       ), inserted AS (
         INSERT INTO conversations (customer_id, professional_id, request_id, proposal_id)
         SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING id
       ) SELECT id FROM inserted UNION ALL SELECT id FROM existing`,
      [serviceRequest.user_id, res.locals.user.id, requestId, result.rows[0].id],
    );
    const conversation = conversationResult.rows[0];
    await client.query(
      `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)`,
      [conversation.id, res.locals.user.id, `Proposta para "${serviceRequest.title}": R$ ${amount.toFixed(2).replace(".", ",")}${estimatedDays ? ` · prazo estimado: ${estimatedDays} dia(s)` : ""}.\n\n${message}`],
    );
    await client.query("UPDATE conversations SET proposal_id = $2, updated_at = NOW() WHERE id = $1", [conversation.id, result.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ proposal: result.rows[0], conversation });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(error);
    jsonError(res, 500, "Não foi possível enviar o orçamento privado.");
  } finally { client.release(); }
});

app.get("/api/proposals", requireUser, async (req, res) => {
  try {
    const query = res.locals.user.role === "profissional"
      ? "SELECT p.*, sr.title, sr.description, u.name AS customer_name FROM proposals p JOIN service_requests sr ON sr.id = p.request_id JOIN users u ON u.id = sr.user_id WHERE p.professional_id = $1 ORDER BY p.created_at DESC"
      : "SELECT p.*, sr.title, sr.description, u.name AS professional_name FROM proposals p JOIN service_requests sr ON sr.id = p.request_id JOIN users u ON u.id = p.professional_id WHERE sr.user_id = $1 ORDER BY p.created_at DESC";
    const result = await pool.query(query, [res.locals.user.id]);
    res.json({ proposals: result.rows });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível carregar os orçamentos.");
  }
});

app.post("/api/proposals/:id/accept", requireUser, async (req, res) => {
  jsonError(res, 503, "O aceite com pagamento retido ainda não está configurado.");
});

app.get("/api/bookings", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.name AS other_user_name
       FROM bookings b
       JOIN users u ON u.id = CASE WHEN b.customer_id = $1 THEN b.professional_id ELSE b.customer_id END
       WHERE b.customer_id = $1 OR b.professional_id = $1
       ORDER BY COALESCE(b.scheduled_at, b.created_at) DESC`,
      [res.locals.user.id],
    );
    res.json({ bookings: result.rows });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível carregar seus serviços agendados.");
  }
});

app.post("/api/reviews", requireUser, async (req, res) => {
  const { professionalId, userId, bookingId, requestId, rating, comment } = req.body || {};
  const targetId = Number(userId || professionalId);
  if (!["usuario", "profissional"].includes(res.locals.user.role)) return jsonError(res, 403, "Sua conta não pode avaliar perfis.");
  if (!Number.isInteger(targetId) || targetId < 1 || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return jsonError(res, 400, "Selecione um perfil e uma nota entre 1 e 5.");
  if (comment != null && String(comment).length > 2000) return jsonError(res, 400, "O comentário deve ter até 2.000 caracteres.");
  try {
    const target = await pool.query("SELECT id, role FROM users WHERE id = $1 AND role IN ('usuario', 'profissional') AND is_active = TRUE", [targetId]);
    if (!target.rows[0] || targetId === Number(res.locals.user.id)) return jsonError(res, 404, "Perfil não encontrado.");
    const conversation = await pool.query(
      "SELECT id FROM conversations WHERE (customer_id = $1 AND professional_id = $2) OR (customer_id = $2 AND professional_id = $1) LIMIT 1",
      [res.locals.user.id, targetId],
    );
    if (!conversation.rows[0]) return jsonError(res, 403, "Só é possível avaliar alguém com quem você conversou pelo ManiService.");
    const priorReview = await pool.query("SELECT id FROM reviews WHERE reviewer_id = $1 AND professional_id = $2 LIMIT 1", [res.locals.user.id, targetId]);
    if (priorReview.rows[0]) return jsonError(res, 409, "Você já avaliou este perfil.");
    const result = await pool.query(
      "INSERT INTO reviews (reviewer_id, professional_id, booking_id, request_id, rating, comment) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [res.locals.user.id, targetId, bookingId || null, requestId || null, rating, comment ? String(comment).trim() : null],
    );
    if (target.rows[0].role === "profissional") await pool.query(
      `UPDATE professional_profiles pp SET rating = stats.rating, total_reviews = stats.total_reviews, updated_at = NOW()
       FROM (SELECT professional_id, ROUND(AVG(rating)::numeric, 1) AS rating, COUNT(*)::int AS total_reviews FROM reviews WHERE professional_id = $1 GROUP BY professional_id) stats
       WHERE pp.user_id = stats.professional_id`,
      [targetId],
    );
    res.status(201).json({ review: result.rows[0] });
  } catch (error) {
    console.error(error);
    jsonError(res, 500, "Não foi possível registrar a avaliação.");
  }
});

app.post("/api/uploads", requireUser, async (req, res) => {
  const { filename, dataUrl } = req.body || {};
  if (!filename || !dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return jsonError(res, 400, "Envie uma imagem em formato data URL.");
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) return jsonError(res, 400, "Formato de imagem não suportado.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 5 * 1024 * 1024) return jsonError(res, 413, "A imagem deve ter no máximo 5 MB.");
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const safeName = `${res.locals.user.id}/${randomUUID()}.${extension}`;
  if (isProduction) {
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "maniservice-media";
    if (!supabaseUrl || !serviceKey) return jsonError(res, 503, "O armazenamento persistente de fotos ainda não foi configurado no servidor.");
    try {
      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
      const bucketsResult = await fetch(`${supabaseUrl}/storage/v1/bucket`, { headers });
      if (!bucketsResult.ok) {
        console.error("Supabase Storage não listou os buckets:", bucketsResult.status, await bucketsResult.text());
        return jsonError(res, 502, "Não foi possível verificar o armazenamento das fotos.");
      }
      const existingBuckets = await bucketsResult.json() as Array<{ id?: string; name?: string }>;
      if (!existingBuckets.some((entry) => entry.id === bucket || entry.name === bucket)) {
        const bucketResult = await fetch(`${supabaseUrl}/storage/v1/bucket`, { method: "POST", headers, body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 5242880, allowed_mime_types: ["image/png", "image/jpeg", "image/webp"] }) });
        if (!bucketResult.ok && bucketResult.status !== 409) {
          console.error("Supabase Storage não criou o bucket:", bucketResult.status, await bucketResult.text());
          return jsonError(res, 502, "Não foi possível preparar o armazenamento das fotos.");
        }
      }
      const uploadResult = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${safeName}`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": `image/${match[1] === "jpg" ? "jpeg" : match[1]}`, "x-upsert": "false" },
        body: new Uint8Array(buffer),
      });
      if (!uploadResult.ok) {
        console.error("Supabase Storage recusou o upload:", uploadResult.status, await uploadResult.text());
        return jsonError(res, 502, "Não foi possível salvar a foto no armazenamento persistente.");
      }
      res.status(201).json({ url: `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safeName}`, filename: path.basename(safeName) });
    } catch (error) { console.error("Falha ao enviar foto ao Supabase Storage:", error); jsonError(res, 502, "Não foi possível salvar a foto agora."); }
    return;
  }
  const localName = `${Date.now()}-${randomBytes(5).toString("hex")}.${extension}`;
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "..", "client", "public", "uploads"));
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, localName), buffer);
  res.status(201).json({ url: `/uploads/${localName}`, filename: localName });
});

const staticPath = isProduction ? path.resolve(__dirname, "public") : path.resolve(__dirname, "..", "client", "public");
const indexPath = isProduction ? path.join(staticPath, "index.html") : path.resolve(__dirname, "..", "client", "index.html");
app.use(express.static(staticPath));
app.get("*", (_req, res) => res.sendFile(indexPath));

async function ensureRuntimeSchema() {
  await pool.query(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_radius_km INTEGER NOT NULL DEFAULT 25;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_local_requests BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_note TEXT;
    ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_check;
    ALTER TABLE reports ADD CONSTRAINT reports_check CHECK (reported_user_id IS NOT NULL OR post_id IS NOT NULL OR request_id IS NOT NULL OR message_id IS NOT NULL);
    CREATE TABLE IF NOT EXISTS report_events (
      id BIGSERIAL PRIMARY KEY,
      report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      moderator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      previous_status VARCHAR(20) NOT NULL,
      new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('em_analise','resolvida','ignorada')),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS report_events_report_created_idx ON report_events (report_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS profiles_location_idx ON profiles (latitude, longitude);
    CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS reports_message_idx ON reports (message_id) WHERE message_id IS NOT NULL;
  `);
}

ensureRuntimeSchema()
  .then(() => server.listen(port, "0.0.0.0", () => console.log(`Server running on http://localhost:${port}/`)))
  .catch((error) => { console.error("Não foi possível preparar as tabelas/colunas do ManiService:", error); process.exit(1); });
