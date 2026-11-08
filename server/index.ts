import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Pool, type PoolClient } from "pg";
import dotenv from "dotenv";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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

function identityEncryptionKey() {
  const configured = process.env.IDENTITY_DATA_KEY?.trim();
  if (!configured || !/^[a-f\d]{64}$/i.test(configured)) {
    throw new Error("Configure IDENTITY_DATA_KEY com 64 caracteres hexadecimais no ambiente do servidor.");
  }
  return Buffer.from(configured, "hex");
}

function encryptIdentityData(value: { cpf: string; birthDate: string }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", identityEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptIdentityData(value: string): { cpf: string; birthDate: string } {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Dados de verificação inválidos.");
  const decipher = createDecipheriv("aes-256-gcm", identityEncryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted) as { cpf: string; birthDate: string };
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length: number) => {
    const sum = digits.slice(0, length).split("").reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
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
  const blockedUntil = row.moderation_blocked_until as string | null | undefined;
  const blockedAt = row.moderation_blocked_at as string | null | undefined;
  const isBlocked = Boolean(blockedAt && (!blockedUntil || new Date(blockedUntil).getTime() > Date.now()));
  return { id: row.id, name: row.name, email: row.email, role: row.role, isModerationBlocked: isBlocked, moderationBlockedUntil: blockedUntil || null, moderationBlockReason: isBlocked ? row.moderation_block_reason || null : null };
}

async function getCurrentUser(req: Request) {
  const sessionId = getCookie(req, sessionCookieName);
  if (!sessionId) return null;
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.moderation_blocked_at, u.moderation_blocked_until, u.moderation_block_reason
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
    const blockedUntil = user.moderation_blocked_until as string | null;
    const isBlocked = Boolean(user.moderation_blocked_at && (!blockedUntil || new Date(blockedUntil).getTime() > Date.now()));
    if (isBlocked && req.path !== "/api/auth/me" && req.path !== "/api/account/appeal" && req.path !== "/api/account/appeal/status") {
      return res.status(423).json({ error: "Sua conta está temporariamente restrita enquanto a equipe analisa uma denúncia.", code: "ACCOUNT_BLOCKED" });
    }
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

async function addBookingChatEvent(
  client: PoolClient,
  booking: { customer_id: number | string; professional_id: number | string; request_id?: number | string | null; proposal_id?: number | string | null },
  senderId: number | string,
  body: string,
  attachmentUrl: string | null = null,
) {
  const found = await client.query(
    `SELECT id FROM conversations
     WHERE customer_id = $1 AND professional_id = $2
       AND (request_id IS NOT DISTINCT FROM $3 OR proposal_id IS NOT DISTINCT FROM $4)
     ORDER BY id LIMIT 1`,
    [booking.customer_id, booking.professional_id, booking.request_id ?? null, booking.proposal_id ?? null],
  );
  const conversation = found.rows[0] || (await client.query(
    `INSERT INTO conversations (customer_id, professional_id, request_id, proposal_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [booking.customer_id, booking.professional_id, booking.request_id ?? null, booking.proposal_id ?? null],
  )).rows[0];
  await client.query("INSERT INTO messages (conversation_id, sender_id, body, attachment_url) VALUES ($1, $2, $3, $4)", [conversation.id, senderId, body, attachmentUrl]);
  await client.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversation.id]);
  return conversation.id as number;
}

async function processServiceReminders() {
  await pool.query(
    `WITH due AS (
       UPDATE service_reminders SET notified_at = NOW()
       WHERE id IN (
         SELECT r.id FROM service_reminders r JOIN bookings b ON b.id = r.booking_id
         WHERE r.notified_at IS NULL AND r.remind_at <= NOW() AND b.status IN ('agendado', 'em_execucao')
         ORDER BY r.remind_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED
       )
       RETURNING booking_id, label
     ), recipients AS (
       SELECT d.label, b.customer_id AS user_id, sr.title
       FROM due d JOIN bookings b ON b.id = d.booking_id JOIN service_requests sr ON sr.id = b.request_id
       UNION ALL
       SELECT d.label, b.professional_id AS user_id, sr.title
       FROM due d JOIN bookings b ON b.id = d.booking_id JOIN service_requests sr ON sr.id = b.request_id
     )
     INSERT INTO notifications (user_id, type, title, body, link)
     SELECT user_id, 'lembrete_servico', 'Lembrete de serviço',
       CASE label WHEN '24_horas' THEN 'O serviço ' || title || ' começa nas próximas 24 horas.' WHEN 'fim_24_horas' THEN 'A previsão de término do serviço ' || title || ' é nas próximas 24 horas. Combine a conclusão com o cliente.' ELSE 'O serviço ' || title || ' começa daqui a aproximadamente 1 hora.' END,
       '/servicos/acompanhar'
     FROM recipients`,
  );
}

app.get("/api/notifications", requireUser, async (_req, res) => {
  try {
    await processServiceReminders();
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
  const archived = req.query.archived === "true";
  if (!['todas', 'aberta', 'em_analise', 'resolvida', 'ignorada'].includes(status)) return jsonError(res, 400, "Filtro de status inválido.");
  try {
    const result = await pool.query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.reviewed_at, r.review_note,
        r.reported_user_id, r.post_id, r.is_archived, subject.moderation_hidden_until, subject.moderation_blocked_at, subject.moderation_blocked_until,
        reporter.name AS reporter_name, subject.name AS reported_user_name,
        p.title AS post_title, p.description AS post_description, p.image_url AS post_image_url, p.moderation_removed_at AS post_removed_at,
        sr.title AS request_title, sr.description AS request_description, sr.image_url AS request_image_url, sr.image_urls AS request_image_urls,
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
       WHERE r.is_archived = $2 AND ($1 = 'todas' OR r.status = $1) ORDER BY CASE r.status WHEN 'aberta' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END, r.created_at ASC LIMIT 200`, [status, archived],
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
    const current = await client.query("SELECT status, is_archived FROM reports WHERE id = $1 FOR UPDATE", [id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 404, "Denúncia não encontrada."); }
    if (current.rows[0].is_archived) { await client.query("ROLLBACK"); return jsonError(res, 409, "Restaure a denúncia para a fila ativa antes de alterar sua análise."); }
    const result = await client.query(
      `UPDATE reports SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = NOW(),
        is_archived = ($2 IN ('resolvida', 'ignorada'))
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

app.patch("/api/admin/reports/:id/archive", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const archived = req.body?.archived === true;
  if (!Number.isInteger(id) || id < 1) return jsonError(res, 400, "Denúncia inválida.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT status, is_archived FROM reports WHERE id = $1 FOR UPDATE", [id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 404, "Denúncia não encontrada."); }
    if (archived && !["resolvida", "ignorada"].includes(current.rows[0].status)) { await client.query("ROLLBACK"); return jsonError(res, 409, "Conclua a análise antes de arquivar a denúncia."); }
    if (Boolean(current.rows[0].is_archived) !== archived) {
      await client.query("UPDATE reports SET is_archived = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1", [id, archived, res.locals.user.id]);
      await client.query(
        `INSERT INTO report_events (report_id, moderator_id, previous_status, new_status, note)
         VALUES ($1, $2, $3, $3, $4)`,
        [id, res.locals.user.id, current.rows[0].status, archived ? "Denúncia arquivada após análise." : "Denúncia restaurada à fila ativa."],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, archived });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível arquivar a denúncia."); }
  finally { client.release(); }
});

app.post("/api/admin/reports/:id/action", requireAdmin, async (req, res) => {
  const reportId = Number(req.params.id);
  const action = String(req.body?.action || "");
  const note = String(req.body?.note || "").trim().slice(0, 2000);
  const days = Number(req.body?.days || 0);
  if (!Number.isInteger(reportId) || reportId < 1 || !["remove_post", "hide_user", "block_user", "unblock_user"].includes(action)) return jsonError(res, 400, "Ação de moderação inválida.");
  if ((action === "hide_user" || action === "block_user") && (!Number.isInteger(days) || days < 0 || days > 3650)) return jsonError(res, 400, "Informe uma duração válida em dias; 0 mantém a restrição sem prazo.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT id, reported_user_id, post_id, status, is_archived FROM reports WHERE id = $1 FOR UPDATE", [reportId]);
    const report = result.rows[0];
    if (!report) { await client.query("ROLLBACK"); return jsonError(res, 404, "Denúncia não encontrada."); }
    if (report.is_archived) { await client.query("ROLLBACK"); return jsonError(res, 409, "Restaure a denúncia antes de aplicar novas ações de moderação."); }
    if (action === "remove_post") {
      if (!report.post_id) { await client.query("ROLLBACK"); return jsonError(res, 400, "Esta denúncia não se refere a uma publicação."); }
      const removed = await client.query("UPDATE posts SET moderation_removed_at = COALESCE(moderation_removed_at, NOW()) WHERE id = $1 RETURNING id", [report.post_id]);
      if (!removed.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 404, "A publicação não foi encontrada."); }
    } else {
      if (!report.reported_user_id) { await client.query("ROLLBACK"); return jsonError(res, 400, "Esta denúncia não identifica uma conta para moderar."); }
      if (Number(report.reported_user_id) === Number(res.locals.user.id)) { await client.query("ROLLBACK"); return jsonError(res, 400, "Não é permitido aplicar essa ação à sua própria conta."); }
      if (action === "hide_user") {
        await client.query("UPDATE users SET moderation_hidden_until = NOW() + make_interval(days => $2::int), moderation_action_note = $3 WHERE id = $1", [report.reported_user_id, days || 36500, note || "Ocultação preventiva aplicada pela moderação."]);
      } else if (action === "block_user") {
        await client.query("UPDATE users SET moderation_blocked_at = NOW(), moderation_blocked_until = CASE WHEN $2::int = 0 THEN NULL ELSE NOW() + make_interval(days => $2::int) END, moderation_block_reason = $3, moderation_action_note = $3 WHERE id = $1", [report.reported_user_id, days, note || "Acesso restrito enquanto a equipe analisa a denúncia."]);
        await client.query("DELETE FROM sessions WHERE user_id = $1", [report.reported_user_id]);
      } else {
        await client.query("UPDATE users SET moderation_blocked_at = NULL, moderation_blocked_until = NULL, moderation_block_reason = NULL, moderation_hidden_until = NULL, moderation_action_note = $2 WHERE id = $1", [report.reported_user_id, note || "Restrições removidas pela moderação."]);
      }
      const notificationText = action === "hide_user" ? "Seu perfil ficará oculto da descoberta pública durante uma revisão da equipe." : action === "block_user" ? "O acesso à sua conta foi restrito. Entre para enviar um recurso e acompanhar a revisão da equipe." : "A equipe removeu as restrições da sua conta. Você já pode voltar a usar o ManiService.";
      await client.query("INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, 'moderacao_conta', 'Atualização da equipe ManiService', $2, $3)", [report.reported_user_id, notificationText, action === "block_user" ? "/conta-bloqueada" : "/servicos"]);
    }
    const actionText = action === "remove_post" ? "Publicação removida da exibição pública." : action === "hide_user" ? `Perfil ocultado por ${days || "prazo indeterminado"} dia(s).` : action === "block_user" ? `Conta bloqueada ${days ? `por ${days} dia(s)` : "sem prazo definido"}.` : "Restrições de bloqueio/ocultação removidas.";
    const eventNote = [actionText, note].filter(Boolean).join(" ");
    await client.query("INSERT INTO report_events (report_id, moderator_id, previous_status, new_status, note) VALUES ($1, $2, $3, $3, $4)", [reportId, res.locals.user.id, report.status, eventNote]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível aplicar a ação de moderação."); }
  finally { client.release(); }
});

app.get("/api/admin/account-appeals", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.user_id, a.message, a.status, a.admin_note, a.created_at, a.reviewed_at,
        u.name AS user_name, u.email AS user_email
       FROM account_appeals a JOIN users u ON u.id = a.user_id
       ORDER BY CASE a.status WHEN 'aberta' THEN 0 ELSE 1 END, a.created_at ASC LIMIT 200`,
    );
    res.json({ appeals: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar os recursos de conta."); }
});

app.patch("/api/admin/account-appeals/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  const adminNote = String(req.body?.adminNote || "").trim();
  if (!Number.isInteger(id) || id < 1 || !["em_analise", "resolvida", "negada"].includes(status) || adminNote.length > 2000) return jsonError(res, 400, "Atualização do recurso inválida.");
  try {
    const result = await pool.query(
      `UPDATE account_appeals SET status = $2, admin_note = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE id = $1 RETURNING user_id, status`, [id, status, adminNote || null, res.locals.user.id],
    );
    if (!result.rows[0]) return jsonError(res, 404, "Recurso não encontrado.");
    if (status === "resolvida") await pool.query("UPDATE users SET moderation_blocked_at = NULL, moderation_blocked_until = NULL, moderation_block_reason = NULL, moderation_hidden_until = NULL WHERE id = $1", [result.rows[0].user_id]);
    await notifyUser(result.rows[0].user_id, "recurso_conta", "Atualização do recurso da conta", adminNote || `O status do recurso foi atualizado para ${status.replaceAll("_", " ")}.`, status === "resolvida" ? "/servicos" : "/conta-bloqueada").catch(() => undefined);
    res.json({ ok: true });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível atualizar o recurso."); }
});

app.get("/api/account/appeal/status", requireUser, async (_req, res) => {
  try {
    const result = await pool.query("SELECT id, message, status, admin_note, created_at, reviewed_at FROM account_appeals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [res.locals.user.id]);
    res.json({ appeal: result.rows[0] || null });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível consultar seu recurso."); }
});

app.post("/api/account/appeal", requireUser, async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (message.length < 10 || message.length > 3000) return jsonError(res, 400, "Explique o motivo do recurso em 10 a 3.000 caracteres.");
  try {
    const pending = await pool.query("SELECT id FROM account_appeals WHERE user_id = $1 AND status IN ('aberta','em_analise') LIMIT 1", [res.locals.user.id]);
    if (pending.rows[0]) return jsonError(res, 409, "Você já tem um recurso aguardando análise.");
    const result = await pool.query("INSERT INTO account_appeals (user_id, message) VALUES ($1, $2) RETURNING id, status, created_at", [res.locals.user.id, message]);
    await pool.query("INSERT INTO notifications (user_id, type, title, body, link) SELECT id, 'recurso_conta', 'Novo recurso de conta', $1, '/admin/denuncias?tab=recursos' FROM users WHERE role = 'admin' AND is_active = TRUE", [`${res.locals.user.name} enviou um recurso de conta.`]);
    res.status(201).json({ appeal: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível enviar seu recurso."); }
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
        u.identity_verified,
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
    const [postsResult, reviewsResult, verificationResult] = await Promise.all([
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
      pool.query(
        `SELECT id, status, encrypted_data, admin_note, submitted_at, reviewed_at
         FROM identity_verification_requests WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`, [userId],
      ),
    ]);
    const verification = verificationResult.rows[0] || null;
    let identityVerification: Record<string, unknown> | null = verification ? { id: verification.id, status: verification.status, admin_note: verification.admin_note, submitted_at: verification.submitted_at, reviewed_at: verification.reviewed_at } : null;
    if (verification && verification.status === "pendente") {
      try { identityVerification = { ...identityVerification, ...decryptIdentityData(String(verification.encrypted_data)) }; }
      catch (error) { console.error("Falha ao descriptografar dados da verificação de identidade.", error); return jsonError(res, 503, "Não foi possível abrir os dados da verificação. Confira a chave IDENTITY_DATA_KEY do servidor."); }
    }
    res.json({ account, posts: postsResult.rows, reviews: reviewsResult.rows, identityVerification });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar o perfil da conta."); }
});

app.patch("/api/admin/users/:id/identity-verification", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const status = String(req.body?.status || "");
  const note = String(req.body?.note || "").trim();
  if (!Number.isInteger(userId) || userId < 1 || !["verificada", "ajuste_solicitado"].includes(status)) return jsonError(res, 400, "Ação de verificação inválida.");
  if (status === "ajuste_solicitado" && note.length < 5) return jsonError(res, 400, "Explique o que a pessoa precisa corrigir (mínimo de 5 caracteres).");
  if (note.length > 1000) return jsonError(res, 400, "A observação deve ter no máximo 1.000 caracteres.");
  try {
    const client = await pool.connect();
    let verificationId: number;
    try {
      await client.query("BEGIN");
      const latest = await client.query("SELECT id FROM identity_verification_requests WHERE user_id = $1 AND status = 'pendente' ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE", [userId]);
      if (!latest.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 409, "Não há uma solicitação pendente para revisar."); }
      verificationId = Number(latest.rows[0].id);
      await client.query(
        `UPDATE identity_verification_requests SET status = $2, admin_note = $3,
         reviewed_by = $4, reviewed_at = NOW() WHERE id = $1`,
        [verificationId, status, note || null, res.locals.user.id],
      );
      if (status === "verificada") await client.query("UPDATE users SET identity_verified = TRUE WHERE id = $1", [userId]);
      else await client.query("UPDATE users SET identity_verified = FALSE WHERE id = $1", [userId]);
      const message = status === "verificada" ? "A equipe conferiu os dados enviados e aprovou sua verificação." : `A equipe pediu ajustes nos dados de verificação: ${note}`;
      await client.query("INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, 'verificacao_identidade', $2, $3, '/perfil')", [userId, status === "verificada" ? "Perfil verificado" : "Ajuste na verificação", message]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    res.json({ ok: true, status });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível atualizar a verificação."); }
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
  const city = String(req.body?.city || "").trim();
  const state = String(req.body?.state || "").trim().toUpperCase();
  if (!name || !email || !password || !city || !["usuario", "profissional"].includes(role)) return jsonError(res, 400, "Nome, e-mail, senha, cidade e perfil são obrigatórios.");
  if (city.length > 100 || (state && !/^[A-Z]{2}$/.test(state))) return jsonError(res, 400, "Confira a cidade e a sigla do estado.");
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
    await client.query("INSERT INTO profiles (user_id, city, state) VALUES ($1, $2, $3)", [user.id, city, state || null]);
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
    const result = await pool.query("SELECT id, name, email, password_hash, role, moderation_blocked_at, moderation_blocked_until, moderation_block_reason FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE", [String(email).trim()]);
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

app.get("/api/account/identity-verification", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, admin_note, submitted_at, reviewed_at FROM identity_verification_requests
       WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`, [res.locals.user.id],
    );
    res.json({ request: result.rows[0] || null });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível consultar a verificação."); }
});

app.post("/api/account/identity-verification", requireUser, async (req, res) => {
  const cpf = String(req.body?.cpf || "").replace(/\D/g, "");
  const birthDate = String(req.body?.birthDate || "");
  if (!isValidCpf(cpf)) return jsonError(res, 400, "Informe um CPF válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)) || new Date(`${birthDate}T00:00:00Z`).toISOString().slice(0, 10) !== birthDate || new Date(`${birthDate}T00:00:00Z`).getTime() > Date.now()) return jsonError(res, 400, "Informe uma data de nascimento válida.");
  let encryptedData: string;
  try { encryptedData = encryptIdentityData({ cpf, birthDate }); }
  catch (error) { console.error("A chave de criptografia da verificação de identidade não está configurada.", error); return jsonError(res, 503, "A verificação ainda não está configurada no servidor. Tente novamente mais tarde."); }
  try {
    const current = await pool.query("SELECT status FROM identity_verification_requests WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1", [res.locals.user.id]);
    if (current.rows[0]?.status === "pendente") return jsonError(res, 409, "Sua verificação já está aguardando análise.");
    if (current.rows[0]?.status === "verificada") return jsonError(res, 409, "Sua identidade já foi verificada.");
    const result = await pool.query(
      `INSERT INTO identity_verification_requests (user_id, encrypted_data) VALUES ($1, $2)
       RETURNING status, admin_note, submitted_at, reviewed_at`, [res.locals.user.id, encryptedData],
    );
    await pool.query(
      "INSERT INTO notifications (user_id, type, title, body, link) SELECT id, 'verificacao_identidade', 'Verificação de perfil pendente', $1, '/admin/pessoas' FROM users WHERE role = 'admin' AND is_active = TRUE",
      [`${res.locals.user.name} enviou dados para verificação do perfil.`],
    );
    res.status(201).json({ request: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível enviar os dados para análise."); }
});

app.get("/api/profile", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.phone, u.identity_verified, p.bio, p.address_line,
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
         WHERE po.visibility = 'publico' AND po.moderation_removed_at IS NULL AND p.is_public = TRUE AND u.is_active = TRUE
           AND (u.moderation_hidden_until IS NULL OR u.moderation_hidden_until <= NOW())
         UNION ALL
         SELECT 'pedido'::text AS kind, sr.id, sr.title, sr.description, sr.image_url,
           sr.created_at, u.id AS author_id, u.name AS author_name, u.role AS author_role,
           p.avatar_url, sr.city, sr.state, 0::int AS likes_count, 0::int AS comments_count, FALSE AS liked_by_me
         FROM service_requests sr JOIN users u ON u.id = sr.user_id JOIN profiles p ON p.user_id = u.id
         WHERE sr.status IN ('aberto', 'em_analise') AND p.is_public = TRUE AND u.is_active = TRUE
           AND (u.moderation_hidden_until IS NULL OR u.moderation_hidden_until <= NOW())
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
         AND (u.moderation_hidden_until IS NULL OR u.moderation_hidden_until <= NOW())
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
       WHERE pl.post_id = $1 AND pl.user_id = $2 AND po.id = pl.post_id AND po.moderation_removed_at IS NULL AND p.user_id = po.user_id
       RETURNING pl.post_id`,
      [postId, res.locals.user.id],
    );
    let liked = false;
    if (!removed.rows[0]) {
      const added = await pool.query(
        `INSERT INTO post_likes (post_id, user_id)
         SELECT po.id, $2 FROM posts po JOIN profiles p ON p.user_id = po.user_id
         WHERE po.id = $1 AND po.visibility = 'publico' AND po.moderation_removed_at IS NULL AND p.is_public = TRUE
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
       WHERE po.id = $1 AND po.moderation_removed_at IS NULL AND (po.user_id = $2 OR (po.visibility = 'publico' AND p.is_public = TRUE))`,
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
       WHERE po.id = $1 AND po.moderation_removed_at IS NULL AND (po.user_id = $2 OR (po.visibility = 'publico' AND p.is_public = TRUE))
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
        CASE WHEN u.role = 'admin' THEN 'Equipe ManiService' ELSE u.name END AS other_user_name,
        u.role AS other_user_role, p.avatar_url AS other_user_avatar_url,
        lm.id AS last_message_id, lm.sender_id AS last_message_sender_id,
        lm.body AS last_message, lm.created_at AS last_message_at,
        (SELECT COUNT(*)::int FROM messages unread
         WHERE unread.conversation_id = c.id AND unread.sender_id <> $1 AND unread.read_at IS NULL) AS unread_count
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.customer_id = $1 THEN c.professional_id ELSE c.customer_id END
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN LATERAL (SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON TRUE
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

app.post("/api/admin/users/:id/conversation", requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const adminId = Number(res.locals.user.id);
  if (!Number.isInteger(targetId) || targetId < 1 || targetId === adminId) return jsonError(res, 400, "Selecione uma conta válida para contatar.");
  try {
    const target = await pool.query("SELECT id FROM users WHERE id = $1 AND is_active = TRUE", [targetId]);
    if (!target.rows[0]) return jsonError(res, 404, "A conta não existe ou está inativa.");
    const existing = await pool.query(
      `SELECT id FROM conversations
       WHERE customer_id = $1 AND professional_id = $2 AND request_id IS NULL AND proposal_id IS NULL
       ORDER BY id LIMIT 1`, [adminId, targetId],
    );
    const conversation = existing.rows[0] || (await pool.query(
      `INSERT INTO conversations (customer_id, professional_id)
       VALUES ($1, $2) RETURNING id`, [adminId, targetId],
    )).rows[0];
    res.status(201).json({ conversation });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível iniciar o contato administrativo."); }
});

app.get("/api/conversations/:id/messages", requireUser, async (req, res) => {
  try {
    const conversation = await pool.query("SELECT id FROM conversations WHERE id = $1 AND (customer_id = $2 OR professional_id = $2)", [req.params.id, res.locals.user.id]);
    if (!conversation.rows[0]) return jsonError(res, 404, "Conversa não encontrada.");
    const markedRead = await pool.query("UPDATE messages SET read_at = NOW() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL RETURNING id", [req.params.id, res.locals.user.id]);
    const result = await pool.query(
      `SELECT m.id, m.sender_id, CASE WHEN u.role = 'admin' THEN 'Equipe ManiService' ELSE u.name END AS sender_name,
        m.body, m.attachment_url, m.created_at, m.read_at
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
      if (preferences.rows[0]?.notify_messages !== false) {
        const isAdminMessage = res.locals.user.role === "admin";
        await notifyUser(recipient.rows[0].user_id, isAdminMessage ? "admin_message" : "message", isAdminMessage ? "Mensagem da Equipe ManiService" : "Nova mensagem", isAdminMessage ? "A equipe ManiService enviou uma mensagem." : `${res.locals.user.name} enviou uma mensagem.`, `/mensagens?conversation=${result.rows[0].conversation_id}`);
      }
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
       WHERE u.is_active = TRUE AND (u.moderation_hidden_until IS NULL OR u.moderation_hidden_until <= NOW())
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
       WHERE u.role = 'profissional' AND u.is_active = TRUE AND p.is_public = TRUE
         AND (u.moderation_hidden_until IS NULL OR u.moderation_hidden_until <= NOW())
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
        u.identity_verified,
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
         AND u.is_active = TRUE AND (u.moderation_hidden_until IS NULL OR u.moderation_hidden_until <= NOW())
         AND (p.is_public = TRUE OR u.id = $2)`,
      [professionalId, res.locals.user.id],
    );
    if (!profileResult.rows[0]) return jsonError(res, 404, "Perfil não encontrado.");
    const [posts, reviews] = await Promise.all([
      pool.query(
        `SELECT po.id, po.title, po.description, po.image_url, po.created_at,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = po.id) AS likes_count,
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = po.id) AS comments_count,
          EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = po.id AND pl.user_id = $2) AS liked_by_me
         FROM posts po WHERE po.user_id = $1 AND po.visibility = 'publico' AND po.moderation_removed_at IS NULL ORDER BY po.created_at DESC`,
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
  const rawImageUrls = req.body?.imageUrls;
  const imageUrls: string[] = Array.isArray(rawImageUrls) ? rawImageUrls : imageUrl ? [imageUrl] : [];
  if (imageUrls.length > 2 || imageUrls.some((url) => typeof url !== "string" || url.length > 2048)) return jsonError(res, 400, "Um pedido pode ter até 2 fotos válidas.");
  const latitude = req.body?.latitude == null ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude == null ? null : Number(req.body.longitude);
  if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude != null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) return jsonError(res, 400, "A localização informada é inválida.");
  if (!category || !title || !description) return jsonError(res, 400, "Categoria, título e descrição são obrigatórios.");
  try {
    const result = await pool.query(
      `INSERT INTO service_requests (user_id, category, title, description, location, city, state, image_url, image_urls, preferred_date, budget_min, budget_max, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14) RETURNING *`,
      [res.locals.user.id, category, title, description, location || null, city || null, state || null, imageUrls[0] || null, JSON.stringify(imageUrls), preferredDate || null, budgetMin || null, budgetMax || null, latitude, longitude],
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
    if (!result.rows[0]) return jsonError(res, 409, "Só é possível remover seu próprio pedido enquanto ele estiver aberto e sem serviço contratado.");
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

app.post("/api/service-requests/:id/proposals", requireProfessional, async (req, res) => {
  const requestId = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const message = String(req.body?.message || "").trim();
  const estimatedDays = req.body?.estimatedDays ? Number(req.body.estimatedDays) : null;
  const availableStartAt = new Date(String(req.body?.availableStartAt || ""));
  if (!Number.isInteger(requestId) || requestId < 1) return jsonError(res, 400, "Pedido inválido.");
  if (!Number.isFinite(amount) || amount <= 0 || !message || Number.isNaN(availableStartAt.getTime()) || availableStartAt.getTime() <= Date.now()) return jsonError(res, 400, "Informe valor, mensagem e uma data futura para começar.");
  if (message.length > 5000 || (estimatedDays !== null && (!Number.isInteger(estimatedDays) || estimatedDays < 1))) return jsonError(res, 400, "Confira a mensagem e o prazo informado.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT user_id, title FROM service_requests WHERE id = $1 AND status IN ('aberto', 'em_analise')", [requestId]);
    const serviceRequest = request.rows[0];
    if (!serviceRequest) { await client.query("ROLLBACK"); return jsonError(res, 404, "Pedido não encontrado ou indisponível."); }
    if (Number(serviceRequest.user_id) === Number(res.locals.user.id)) { await client.query("ROLLBACK"); return jsonError(res, 400, "Você não pode enviar proposta para seu próprio pedido."); }
    const result = await client.query(
      `INSERT INTO proposals (request_id, professional_id, amount, message, estimated_days, available_start_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (request_id, professional_id)
       DO UPDATE SET amount = EXCLUDED.amount, message = EXCLUDED.message, estimated_days = EXCLUDED.estimated_days, available_start_at = EXCLUDED.available_start_at, status = 'enviado', updated_at = NOW()
       RETURNING *`,
      [requestId, res.locals.user.id, amount, message, estimatedDays, availableStartAt.toISOString()],
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
  const proposalId = Number(req.params.id);
  if (!Number.isInteger(proposalId) || proposalId < 1) return jsonError(res, 400, "Orçamento inválido.");
  const client = await pool.connect();
  let booking: Record<string, any> | undefined;
  let professionalId: number | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT p.*, sr.user_id AS customer_id, sr.title
       FROM proposals p JOIN service_requests sr ON sr.id = p.request_id
       WHERE p.id = $1 FOR UPDATE OF sr, p`, [proposalId],
    );
    const proposal = result.rows[0];
    if (!proposal || Number(proposal.customer_id) !== Number(res.locals.user.id)) { await client.query("ROLLBACK"); return jsonError(res, 404, "Orçamento não encontrado para sua conta."); }
    if (!["enviado", "visualizado"].includes(proposal.status)) { await client.query("ROLLBACK"); return jsonError(res, 409, "Este orçamento não está mais disponível."); }
    const scheduledAt = new Date(String(proposal.available_start_at || ""));
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) { await client.query("ROLLBACK"); return jsonError(res, 409, "Peça ao profissional para atualizar o orçamento com uma data futura antes de aceitar."); }
    const existing = await client.query("SELECT id FROM bookings WHERE request_id = $1 AND status <> 'cancelado' LIMIT 1", [proposal.request_id]);
    if (existing.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 409, "Este pedido já tem um serviço contratado."); }
    professionalId = Number(proposal.professional_id);
    const inserted = await client.query(
      `INSERT INTO bookings (request_id, proposal_id, customer_id, professional_id, scheduled_at, estimated_days, agreed_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [proposal.request_id, proposal.id, res.locals.user.id, professionalId, scheduledAt.toISOString(), proposal.estimated_days, proposal.amount],
    );
    const createdBooking = inserted.rows[0];
    booking = createdBooking;
    await client.query(
      `INSERT INTO service_reminders (booking_id, remind_at, label)
       VALUES ($1, GREATEST($2::timestamptz - INTERVAL '24 hours', NOW()), '24_horas'),
              ($1, GREATEST($2::timestamptz - INTERVAL '1 hour', NOW()), '1_hora')
       ON CONFLICT (booking_id, label) DO NOTHING`,
      [createdBooking.id, scheduledAt.toISOString()],
    );
    if (proposal.estimated_days) {
      await client.query(
        `INSERT INTO service_reminders (booking_id, remind_at, label)
         VALUES ($1, GREATEST($2::timestamptz + ($3::int * INTERVAL '1 day') - INTERVAL '24 hours', NOW()), 'fim_24_horas')
         ON CONFLICT (booking_id, label) DO NOTHING`,
        [createdBooking.id, scheduledAt.toISOString(), proposal.estimated_days],
      );
    }
    await client.query("UPDATE proposals SET status = CASE WHEN id = $2 THEN 'aceito' ELSE 'recusado' END, updated_at = NOW() WHERE request_id = $1", [proposal.request_id, proposal.id]);
    await client.query("UPDATE service_requests SET status = 'em_execucao', updated_at = NOW() WHERE id = $1", [proposal.request_id]);
    const startLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(scheduledAt);
    await addBookingChatEvent(client, createdBooking, res.locals.user.id, `Orçamento aceito. Serviço agendado para ${startLabel}. Valor combinado: R$ ${Number(proposal.amount).toFixed(2).replace(".", ",")}.`);
    await client.query("COMMIT");
    await notifyUser(professionalId, "servico_agendado", "Orçamento aceito", `${res.locals.user.name} aceitou seu orçamento para ${proposal.title}.`, "/servicos/acompanhar").catch((error) => console.error("Não foi possível notificar sobre o agendamento:", error));
    res.status(201).json({ booking });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(error);
    jsonError(res, 500, "Não foi possível aceitar este orçamento.");
  } finally { client.release(); }
});

app.get("/api/bookings", requireUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.name AS other_user_name, sr.title,
        EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id AND r.reviewer_id = $1) AS reviewed_by_me,
        (SELECT c.id FROM conversations c WHERE c.customer_id = b.customer_id AND c.professional_id = b.professional_id
          AND (c.request_id IS NOT DISTINCT FROM b.request_id OR c.proposal_id IS NOT DISTINCT FROM b.proposal_id)
          ORDER BY c.id LIMIT 1) AS conversation_id
       FROM bookings b
       JOIN users u ON u.id = CASE WHEN b.customer_id = $1 THEN b.professional_id ELSE b.customer_id END
       LEFT JOIN service_requests sr ON sr.id = b.request_id
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

app.post("/api/bookings/:id/arrival", requireUser, async (req, res) => {
  const bookingId = Number(req.params.id);
  const status = String(req.body?.status || "");
  if (!Number.isInteger(bookingId) || !["a_caminho", "cheguei"].includes(status)) return jsonError(res, 400, "Atualização de chegada inválida.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE bookings SET arrival_status = $1, updated_at = NOW() WHERE id = $2 AND professional_id = $3 AND status IN ('agendado', 'em_execucao') RETURNING *", [status, bookingId, res.locals.user.id]);
    if (!result.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 404, "Serviço não encontrado ou indisponível."); }
    const booking = result.rows[0];
    await addBookingChatEvent(client, booking, res.locals.user.id, status === "a_caminho" ? "O profissional avisou: estou a caminho." : "O profissional avisou: cheguei ao local.");
    await client.query("COMMIT");
    await notifyUser(booking.customer_id, "servico_chegada", status === "a_caminho" ? "Profissional a caminho" : "Profissional chegou", status === "a_caminho" ? "O profissional avisou que está a caminho." : "O profissional avisou que chegou ao local.", "/servicos/acompanhar").catch(() => undefined);
    res.json({ booking });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível atualizar a chegada."); }
  finally { client.release(); }
});

app.post("/api/bookings/:id/start", requireUser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE bookings SET status = 'em_execucao', updated_at = NOW() WHERE id = $1 AND professional_id = $2 AND status = 'agendado' RETURNING *", [req.params.id, res.locals.user.id]);
    if (!result.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 404, "Serviço não encontrado ou já iniciado."); }
    await addBookingChatEvent(client, result.rows[0], res.locals.user.id, "O profissional iniciou o serviço.");
    await client.query("COMMIT");
    await notifyUser(result.rows[0].customer_id, "servico_iniciado", "Serviço iniciado", "O profissional iniciou o serviço contratado.", "/servicos/acompanhar").catch(() => undefined);
    res.json({ booking: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível iniciar o serviço."); }
  finally { client.release(); }
});

app.post("/api/bookings/:id/complete", requireUser, async (req, res) => {
  const bookingId = Number(req.params.id);
  const completionImageUrl = String(req.body?.completionImageUrl || "").trim() || null;
  const finalAmount = Number(req.body?.finalAmount);
  if (!Number.isInteger(bookingId) || bookingId < 1) return jsonError(res, 400, "Serviço inválido.");
  if (!Number.isFinite(finalAmount) || finalAmount < 0) return jsonError(res, 400, "Informe um valor final válido.");
  if (completionImageUrl && (!completionImageUrl.startsWith("/") && !completionImageUrl.startsWith("https://"))) return jsonError(res, 400, "A foto de conclusão não é válida.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE bookings SET status = 'aguardando_confirmacao', final_amount = $3, completion_image_url = $4, professional_completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND professional_id = $2 AND status = 'em_execucao' RETURNING *", [bookingId, res.locals.user.id, finalAmount, completionImageUrl]);
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      const current = await pool.query("SELECT status FROM bookings WHERE id = $1 AND professional_id = $2", [bookingId, res.locals.user.id]);
      if (!current.rows[0]) return jsonError(res, 404, "Este serviço não foi encontrado para sua conta.");
      if (current.rows[0].status === "aguardando_confirmacao") {
        const existing = await pool.query("SELECT * FROM bookings WHERE id = $1", [bookingId]);
        return res.json({ booking: existing.rows[0], alreadyCompleted: true });
      }
      if (current.rows[0].status === "agendado") return jsonError(res, 409, "Inicie o serviço antes de marcá-lo como concluído.");
      return jsonError(res, 409, `Este serviço não pode ser concluído agora (status: ${current.rows[0].status}). Atualize a página e confira o acompanhamento.`);
    }
    const booking = result.rows[0];
    await client.query("COMMIT");
    const amountText = `Valor final proposto: R$ ${finalAmount.toFixed(2).replace(".", ",")}.`;
    try {
      await addBookingChatEvent(client, booking, res.locals.user.id, `O profissional marcou o serviço como concluído. ${amountText} Confira o acompanhamento e confirme ou informe um problema.`, completionImageUrl);
    } catch (chatError) {
      console.error("Serviço concluído, mas não foi possível registrar a mensagem no chat:", chatError);
    }
    await notifyUser(booking.customer_id, "servico_concluido", "Confirme a conclusão", "O profissional marcou o serviço como concluído. Confira e confirme ou informe um problema.", "/servicos/acompanhar").catch(() => undefined);
    res.json({ booking });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Não foi possível marcar o serviço como concluído:", error);
    const code = (error as { code?: string }).code;
    if (code === "23514") {
      return jsonError(res, 503, "O banco ainda não permite a etapa de confirmação do cliente. Atualize a migração de acompanhamento no Supabase e tente novamente.");
    }
    if (code === "42703" || code === "42P01") {
      return jsonError(res, 503, "O banco está sem uma coluna ou tabela necessária para concluir serviços. Atualize a migração de acompanhamento no Supabase.");
    }
    if (code === "23503" || code === "23502") {
      return jsonError(res, 503, "O banco ainda não está totalmente atualizado para concluir serviços. Aplique a migração de acompanhamento no Supabase e tente novamente.");
    }
    if (code === "22P02" || code === "22003") {
      return jsonError(res, 400, "O valor final informado não é válido. Confira o valor e tente novamente.");
    }
    jsonError(res, 500, "Não foi possível concluir o serviço.");
  } finally { client.release(); }
});

app.post("/api/bookings/:id/confirm", requireUser, async (req, res) => {
  const client = await pool.connect();
  const paidDirectly = req.body?.paidDirectly === true;
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE bookings SET status = 'concluido', customer_confirmed_at = NOW(), updated_at = NOW() WHERE id = $1 AND customer_id = $2 AND status = 'aguardando_confirmacao' AND (issue_details IS NULL OR issue_review_status = 'resolvida') RETURNING *", [req.params.id, res.locals.user.id]);
    if (!result.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 409, "Este serviço ainda não está disponível para confirmação. Se houver um problema em análise, aguarde a equipe."); }
    const booking = result.rows[0];
    const finalAmount = Number(booking.final_amount ?? booking.agreed_amount);
    await client.query("UPDATE service_requests SET status = 'concluido', updated_at = NOW() WHERE id = $1", [booking.request_id]);
    await addBookingChatEvent(client, booking, res.locals.user.id, paidDirectly
      ? `O cliente confirmou a conclusão e informou que pagou diretamente ao profissional (R$ ${finalAmount.toFixed(2).replace(".", ",")}).`
      : "O cliente confirmou a conclusão do serviço.");
    if (paidDirectly) {
      await client.query(
        `INSERT INTO wallet_entries (user_id, booking_id, entry_type, description, amount, payment_method, report_source, reported_by_user_id)
         SELECT b.professional_id, b.id, 'receita', 'Serviço concluído: ' || COALESCE(sr.title, 'serviço'), $2,
           'informado pelo cliente', 'cliente_confirmou', $3
         FROM bookings b LEFT JOIN service_requests sr ON sr.id = b.request_id WHERE b.id = $1
         ON CONFLICT DO NOTHING`,
        [booking.id, finalAmount, res.locals.user.id],
      );
    }
    if (booking.completion_image_url) {
      await client.query(
        `INSERT INTO posts (user_id, title, description, image_url, visibility)
         SELECT b.professional_id, LEFT('Serviço concluído: ' || COALESCE(sr.title, 'serviço'), 180),
           'Serviço concluído em ' || TO_CHAR(COALESCE(b.professional_completed_at, NOW()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
           b.completion_image_url, 'publico'
         FROM bookings b LEFT JOIN service_requests sr ON sr.id = b.request_id
         WHERE b.id = $1 AND b.completion_image_url IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.user_id = b.professional_id AND p.image_url = b.completion_image_url AND p.title = LEFT('Serviço concluído: ' || COALESCE(sr.title, 'serviço'), 180))`,
        [booking.id],
      );
    }
    await client.query("COMMIT");
    await notifyUser(booking.professional_id, "servico_confirmado", "Conclusão confirmada", paidDirectly ? "O cliente confirmou o serviço e informou o pagamento direto. O valor foi anotado na sua Carteira." : "O cliente confirmou a conclusão do serviço.", "/servicos/acompanhar").catch(() => undefined);
    res.json({ booking, paidDirectly });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível confirmar a conclusão."); }
  finally { client.release(); }
});

app.post("/api/bookings/:id/issue", requireUser, async (req, res) => {
  const details = String(req.body?.details || "").trim();
  if (!details || details.length > 3000) return jsonError(res, 400, "Descreva o problema em até 3.000 caracteres.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE bookings SET status = 'em_disputa', issue_details = $1, issue_reported_by = $2, issue_review_status = 'aberta', updated_at = NOW() WHERE id = $3 AND customer_id = $2 AND status = 'aguardando_confirmacao' RETURNING *", [details, res.locals.user.id, req.params.id]);
    if (!result.rows[0]) { await client.query("ROLLBACK"); return jsonError(res, 409, "Só é possível informar um problema enquanto a conclusão aguarda confirmação."); }
    await addBookingChatEvent(client, result.rows[0], res.locals.user.id, `O cliente informou um problema e pediu análise antes de confirmar a conclusão: ${details}`);
    await client.query("UPDATE service_requests SET status = 'em_analise', updated_at = NOW() WHERE id = $1", [result.rows[0].request_id]);
    await client.query("COMMIT");
    await notifyUser(result.rows[0].professional_id, "problema_servico", "Problema informado pelo cliente", "O cliente pediu análise do serviço antes de confirmar a conclusão.", "/servicos").catch(() => undefined);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       SELECT id, 'caso_servico', 'Problema em um serviço', $1, '/admin/denuncias?tab=servicos'
       FROM users WHERE role = 'admin' AND is_active = TRUE`,
      [`${res.locals.user.name} informou um problema no serviço #${result.rows[0].id}.`],
    ).catch((error) => console.error("Não foi possível avisar a equipe sobre o caso:", error));
    res.json({ booking: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error(error); jsonError(res, 500, "Não foi possível registrar o problema."); }
  finally { client.release(); }
});

app.get("/api/admin/service-issues", requireAdmin, async (req, res) => {
  const status = String(req.query.status || "todas");
  if (!["todas", "aberta", "em_analise", "resolvida", "ignorada"].includes(status)) return jsonError(res, 400, "Filtro de casos inválido.");
  try {
    const result = await pool.query(
      `SELECT b.id, b.status AS booking_status, b.issue_details, b.issue_review_status AS status,
        b.issue_review_note AS review_note, b.issue_reviewed_at AS reviewed_at,
        b.scheduled_at, b.agreed_amount, b.created_at,
        customer.name AS customer_name, professional.name AS professional_name,
        reporter.name AS reporter_name, sr.title AS service_title
       FROM bookings b
       JOIN users customer ON customer.id = b.customer_id
       JOIN users professional ON professional.id = b.professional_id
       LEFT JOIN users reporter ON reporter.id = b.issue_reported_by
       LEFT JOIN service_requests sr ON sr.id = b.request_id
       WHERE b.issue_details IS NOT NULL AND ($1 = 'todas' OR b.issue_review_status = $1)
       ORDER BY CASE b.issue_review_status WHEN 'aberta' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END, b.updated_at DESC
       LIMIT 200`, [status],
    );
    res.json({ issues: result.rows });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar os problemas de serviços."); }
});

app.patch("/api/admin/service-issues/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  const reviewNote = String(req.body?.reviewNote || "").trim();
  if (!Number.isInteger(id) || id < 1 || !["em_analise", "resolvida", "ignorada"].includes(status)) return jsonError(res, 400, "Atualização do caso inválida.");
  if (reviewNote.length > 2000) return jsonError(res, 400, "A anotação deve ter até 2.000 caracteres.");
  try {
    const result = await pool.query(
      `UPDATE bookings SET issue_review_status = $2, issue_review_note = $3,
        issue_reviewed_by = $4, issue_reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND issue_details IS NOT NULL
       RETURNING id, issue_review_status AS status, issue_review_note AS review_note, issue_reviewed_at AS reviewed_at`,
      [id, status, reviewNote || null, res.locals.user.id],
    );
    if (!result.rows[0]) return jsonError(res, 404, "Caso de serviço não encontrado.");
    const participants = await pool.query("SELECT customer_id, professional_id FROM bookings WHERE id = $1", [id]);
    if (participants.rows[0]) {
      const message = `A equipe atualizou a análise do problema do serviço #${id}: ${status.replaceAll("_", " ")}.${reviewNote ? ` ${reviewNote}` : ""}`;
      await Promise.all([participants.rows[0].customer_id, participants.rows[0].professional_id].map((userId) =>
        notifyUser(userId, "caso_servico_atualizado", "Atualização sobre o problema do serviço", message, "/servicos/acompanhar").catch(() => undefined),
      ));
    }
    res.json({ issue: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível atualizar o caso de serviço."); }
});

app.get("/api/wallet", requireProfessional, async (req, res) => {
  try {
    const [entries, completedBookings] = await Promise.all([
      pool.query("SELECT * FROM wallet_entries WHERE user_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 500", [res.locals.user.id]),
      pool.query(
        `SELECT b.id AS booking_id, b.final_amount, b.agreed_amount, b.customer_confirmed_at,
          sr.title, customer.name AS customer_name
         FROM bookings b LEFT JOIN service_requests sr ON sr.id = b.request_id
         JOIN users customer ON customer.id = b.customer_id
         WHERE b.professional_id = $1 AND b.status = 'concluido'
           AND NOT EXISTS (SELECT 1 FROM wallet_entries e WHERE e.booking_id = b.id AND e.entry_type = 'receita')
         ORDER BY b.customer_confirmed_at DESC NULLS LAST, b.updated_at DESC`, [res.locals.user.id],
      ),
    ]);
    const income = entries.rows.filter((entry) => entry.entry_type === "receita").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const expenses = entries.rows.filter((entry) => entry.entry_type === "despesa").reduce((sum, entry) => sum + Number(entry.amount), 0);
    res.json({ entries: entries.rows, completedBookings: completedBookings.rows, totals: { income, expenses, balance: income - expenses } });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível carregar a Carteira."); }
});

app.post("/api/wallet/entries", requireProfessional, async (req, res) => {
  const entryType = String(req.body?.entryType || "");
  const bookingId = req.body?.bookingId ? Number(req.body.bookingId) : null;
  const description = String(req.body?.description || "").trim();
  const amount = Number(req.body?.amount);
  const paymentMethod = String(req.body?.paymentMethod || "").trim().slice(0, 40) || null;
  if (!["receita", "despesa"].includes(entryType)) return jsonError(res, 400, "Tipo de lançamento inválido.");
  if (entryType === "despesa" && (!description || description.length > 240 || !Number.isFinite(amount) || amount <= 0)) return jsonError(res, 400, "Informe uma descrição e um valor de despesa válido.");
  if (entryType === "receita" && (!Number.isInteger(bookingId) || Number(bookingId) < 1)) return jsonError(res, 400, "Selecione um serviço concluído para registrar o recebimento.");
  try {
    if (entryType === "receita") {
      const result = await pool.query(
        `INSERT INTO wallet_entries (user_id, booking_id, entry_type, description, amount, payment_method, report_source, reported_by_user_id)
         SELECT b.professional_id, b.id, 'receita', 'Serviço concluído: ' || COALESCE(sr.title, 'serviço'),
           COALESCE(b.final_amount, b.agreed_amount), $3, 'profissional_confirmou', $1
         FROM bookings b LEFT JOIN service_requests sr ON sr.id = b.request_id
         WHERE b.id = $2 AND b.professional_id = $1 AND b.status = 'concluido'
         ON CONFLICT DO NOTHING RETURNING *`, [res.locals.user.id, bookingId, paymentMethod],
      );
      if (!result.rows[0]) return jsonError(res, 409, "Recebimento já registrado ou serviço não pertence à sua conta.");
      res.status(201).json({ entry: result.rows[0] });
      return;
    }
    const result = await pool.query(
      `INSERT INTO wallet_entries (user_id, entry_type, description, amount, payment_method, report_source, reported_by_user_id)
       VALUES ($1, 'despesa', $2, $3, $4, 'lancamento_manual', $1) RETURNING *`,
      [res.locals.user.id, description, amount, paymentMethod],
    );
    res.status(201).json({ entry: result.rows[0] });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível registrar este lançamento."); }
});

app.put("/api/admin/platform-settings/commission", requireAdmin, async (req, res) => {
  const rate = Number(req.body?.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return jsonError(res, 400, "Informe uma taxa entre 0% e 100%.");
  try {
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('commission_rate_percent', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(rate)],
    );
    res.json({ commissionRatePercent: rate });
  } catch (error) { console.error(error); jsonError(res, 500, "Não foi possível salvar a taxa da plataforma."); }
});

app.post("/api/reviews", requireUser, async (req, res) => {
  const { professionalId, bookingId, rating, comment } = req.body || {};
  const targetId = Number(professionalId);
  if (res.locals.user.role !== "usuario") return jsonError(res, 403, "Somente o cliente que contratou o serviço pode avaliar o profissional.");
  if (!Number.isInteger(Number(bookingId)) || Number(bookingId) < 1 || !Number.isInteger(targetId) || targetId < 1 || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return jsonError(res, 400, "Selecione o serviço e uma nota entre 1 e 5.");
  if (comment != null && String(comment).length > 2000) return jsonError(res, 400, "O comentário deve ter até 2.000 caracteres.");
  try {
    const booking = await pool.query("SELECT id FROM bookings WHERE id = $1 AND customer_id = $2 AND professional_id = $3 AND status = 'concluido'", [bookingId, res.locals.user.id, targetId]);
    if (!booking.rows[0]) return jsonError(res, 403, "A avaliação só fica disponível depois da conclusão confirmada de um serviço contratado por você.");
    const result = await pool.query(
      "INSERT INTO reviews (reviewer_id, professional_id, booking_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [res.locals.user.id, targetId, bookingId, rating, comment ? String(comment).trim() : null],
    );
    await pool.query(
      `UPDATE professional_profiles pp SET rating = stats.rating, total_reviews = stats.total_reviews, updated_at = NOW()
       FROM (SELECT professional_id, ROUND(AVG(rating)::numeric, 1) AS rating, COUNT(*)::int AS total_reviews FROM reviews WHERE professional_id = $1 GROUP BY professional_id) stats
       WHERE pp.user_id = stats.professional_id`,
      [targetId],
    );
    await notifyUser(targetId, "avaliacao_servico", "Nova avaliação de serviço", `${res.locals.user.name} avaliou um serviço concluído.`, `/perfil/${targetId}`).catch(() => undefined);
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
    ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
    UPDATE service_requests SET image_urls = jsonb_build_array(image_url) WHERE image_url IS NOT NULL AND image_urls = '[]'::jsonb;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_days INTEGER;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_status VARCHAR(20) NOT NULL DEFAULT 'agendado';
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS professional_completed_at TIMESTAMPTZ;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_image_url TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) NOT NULL DEFAULT 'nao_iniciado';
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_details TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_reported_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_review_status VARCHAR(20) NOT NULL DEFAULT 'aberta';
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_review_note TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS issue_reviewed_at TIMESTAMPTZ;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_note TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_check;
    ALTER TABLE reports ADD CONSTRAINT reports_check CHECK (reported_user_id IS NOT NULL OR post_id IS NOT NULL OR request_id IS NOT NULL OR message_id IS NOT NULL);
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('agendado', 'em_execucao', 'aguardando_confirmacao', 'concluido', 'em_disputa', 'cancelado'));
    CREATE TABLE IF NOT EXISTS report_events (
      id BIGSERIAL PRIMARY KEY,
      report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      moderator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      previous_status VARCHAR(20) NOT NULL,
      new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('aberta','em_analise','resolvida','ignorada')),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS report_events_report_created_idx ON report_events (report_id, created_at ASC);
    ALTER TABLE report_events DROP CONSTRAINT IF EXISTS report_events_new_status_check;
    ALTER TABLE report_events ADD CONSTRAINT report_events_new_status_check CHECK (new_status IN ('aberta','em_analise','resolvida','ignorada'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_hidden_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_blocked_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_blocked_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_block_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_action_note TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS identity_verification_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      encrypted_data TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','verificada','ajuste_solicitado')),
      admin_note TEXT,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS identity_verification_user_submitted_idx ON identity_verification_requests (user_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS identity_verification_pending_idx ON identity_verification_requests (submitted_at ASC) WHERE status = 'pendente';
    ALTER TABLE identity_verification_requests ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE identity_verification_requests FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE identity_verification_requests FROM anon; END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE identity_verification_requests FROM authenticated; END IF;
    END $$;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_removed_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS account_appeals (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 3000),
      status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_analise','resolvida','negada')),
      admin_note TEXT,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS account_appeals_status_created_idx ON account_appeals (status, created_at ASC);
    CREATE INDEX IF NOT EXISTS account_appeals_user_created_idx ON account_appeals (user_id, created_at DESC);
    ALTER TABLE account_appeals ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE account_appeals FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE account_appeals FROM anon; END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE account_appeals FROM authenticated; END IF;
    END $$;
    ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE report_events FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE report_events FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE report_events FROM authenticated;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS profiles_location_idx ON profiles (latitude, longitude);
    CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS reports_message_idx ON reports (message_id) WHERE message_id IS NOT NULL;
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
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE wallet_entries FROM anon; END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE wallet_entries FROM authenticated; END IF;
    END $$;
  `);
}

ensureRuntimeSchema()
  .then(() => server.listen(port, "0.0.0.0", () => console.log(`Server running on http://localhost:${port}/`)))
  .catch((error) => { console.error("Não foi possível preparar as tabelas/colunas do ManiService:", error); process.exit(1); });
