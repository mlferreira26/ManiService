import { useCallback, useEffect, useState } from "react";
import { Archive, CalendarDays, EyeOff, ShieldAlert, ShieldCheck, Trash2, Undo2, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type CaseRow = Record<string, any>;
type MainTab = "denuncias" | "servicos" | "recursos";
const statusLabel: Record<string, string> = { aberta: "Aberta", em_analise: "Em análise", resolvida: "Resolvida", ignorada: "Encerrada sem ação", negada: "Recurso negado" };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminModeration() {
  const { user } = useAuth();
  const [reports, setReports] = useState<CaseRow[]>([]);
  const [issues, setIssues] = useState<CaseRow[]>([]);
  const [appeals, setAppeals] = useState<CaseRow[]>([]);
  const [tab, setTab] = useState<MainTab>(() => new URLSearchParams(window.location.search).get("tab") === "servicos" ? "servicos" : new URLSearchParams(window.location.search).get("tab") === "recursos" ? "recursos" : "denuncias");
  const [filter, setFilter] = useState("todas");
  const [archived, setArchived] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [appealNotes, setAppealNotes] = useState<Record<number, string>>({});
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "denuncias") { const result = await api.adminReports(filter, archived); setReports(result.reports); }
      else if (tab === "servicos") { const result = await api.adminServiceIssues(filter); setIssues(result.issues); }
      else { const result = await api.adminAccountAppeals(); setAppeals(result.appeals); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar a fila de análise."); }
    finally { setLoading(false); }
  }, [filter, tab, archived]);
  useEffect(() => { if (user?.role === "admin") void load(); else setLoading(false); }, [load, user?.role]);

  async function update(report: CaseRow, status: string) {
    setWorkingId(Number(report.id));
    try { await api.updateAdminReport(Number(report.id), status, notes[report.id] || ""); toast.success("Análise registrada."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a análise."); }
    finally { setWorkingId(null); }
  }
  async function archiveReport(report: CaseRow, value: boolean) {
    setWorkingId(Number(report.id));
    try { await api.archiveAdminReport(Number(report.id), value); toast.success(value ? "Caso arquivado." : "Caso restaurado à fila ativa."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o arquivamento."); }
    finally { setWorkingId(null); }
  }
  async function moderate(report: CaseRow, action: string, days = 0) {
    const actionText = action === "remove_post" ? "ocultar esta publicação da comunidade" : action === "hide_user" ? "ocultar o perfil por 7 dias" : action === "block_user" ? "bloquear a conta sem prazo definido" : "remover o bloqueio e a ocultação da conta";
    if (!window.confirm(`Confirma ${actionText}? A ação ficará registrada no histórico da denúncia.`)) return;
    setWorkingId(Number(report.id));
    try { await api.moderateReportedTarget(Number(report.id), action, days, notes[report.id] || ""); toast.success("Ação de moderação registrada no caso."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível aplicar a ação."); }
    finally { setWorkingId(null); }
  }
  async function updateIssue(issue: CaseRow, status: string) {
    setWorkingId(Number(issue.id));
    try { await api.updateAdminServiceIssue(Number(issue.id), status, notes[issue.id] || ""); toast.success("Análise do serviço registrada."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a análise."); }
    finally { setWorkingId(null); }
  }
  async function updateAppeal(appeal: CaseRow, status: string) {
    setWorkingId(Number(appeal.id));
    try { await api.updateAdminAccountAppeal(Number(appeal.id), status, appealNotes[appeal.id] || ""); toast.success(status === "resolvida" ? "Recurso aprovado e conta desbloqueada." : "Revisão do recurso registrada."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o recurso."); }
    finally { setWorkingId(null); }
  }
  const target = (report: CaseRow) => report.message_body ? `Mensagem: ${report.message_body}` : report.post_title ? `Publicação: ${report.post_title}\n${report.post_description || ""}` : report.request_title ? `Pedido: ${report.request_title}\n${report.request_description || ""}` : `Perfil de ${report.reported_user_name || "usuário indisponível"}`;

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-5xl py-8 md:py-10">
    <div className="mb-7"><Badge className="gap-2 bg-blue-100 text-blue-800 hover:bg-blue-100"><ShieldCheck className="h-3.5 w-3.5" />Ferramentas internas</Badge><h1 className="mt-3 text-3xl font-extrabold">Denúncias e segurança</h1><p className="mt-2 max-w-3xl text-muted-foreground">Revise o contexto, registre decisões, aplique medidas proporcionais e mantenha o histórico da análise.</p></div>
    {user?.role !== "admin" ? <Card><CardContent className="flex items-center gap-3 p-6"><ShieldAlert className="h-5 w-5 text-amber-700" /><p className="text-sm">Esta área é exclusiva da equipe de moderação.</p></CardContent></Card> : <>
      <div className="mb-5 flex flex-wrap gap-2"><Button variant={tab === "denuncias" ? "default" : "outline"} onClick={() => setTab("denuncias")}>Denúncias de contas e conteúdo</Button><Button variant={tab === "servicos" ? "default" : "outline"} onClick={() => setTab("servicos")}><CalendarDays className="mr-2 h-4 w-4" />Problemas de serviços</Button><Button variant={tab === "recursos" ? "default" : "outline"} onClick={() => setTab("recursos")}>Recursos de contas bloqueadas</Button></div>
      {tab !== "recursos" && <div className="mb-5 flex flex-wrap items-end gap-3"><label className="block max-w-xs flex-1 space-y-2 text-sm font-medium">Filtrar {tab === "denuncias" ? "denúncias" : "problemas de serviços"}<select value={filter} onChange={(event) => setFilter(event.target.value)} className="flex h-11 w-full rounded-md border border-input bg-white px-3"><option value="todas">Todas</option><option value="aberta">Abertas</option><option value="em_analise">Em análise</option><option value="resolvida">Resolvidas</option><option value="ignorada">Encerradas sem ação</option></select></label>{tab === "denuncias" && <Button variant={archived ? "default" : "outline"} onClick={() => setArchived((value) => !value)}><Archive className="mr-2 h-4 w-4" />{archived ? "Ver fila ativa" : "Ver arquivadas"}</Button>}</div>}
      {loading ? <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando fila...</CardContent></Card> : tab === "denuncias" ? reports.length ? <div className="space-y-4">{reports.map((report) => {
        const busy = workingId === Number(report.id);
        const blocked = Boolean(report.moderation_blocked_at && (!report.moderation_blocked_until || new Date(report.moderation_blocked_until).getTime() > Date.now()));
        const hidden = Boolean(report.moderation_hidden_until && new Date(report.moderation_hidden_until).getTime() > Date.now());
        const requestImages = Array.isArray(report.request_image_urls) ? report.request_image_urls : [];
        const evidenceImages = Array.from(new Set([report.post_image_url, report.request_image_url, ...requestImages].filter((url): url is string => typeof url === "string" && url.length > 0)));
        return <Card key={report.id}><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Denúncia #{report.id} · {new Date(report.created_at).toLocaleString("pt-BR")}</p><h2 className="mt-1 text-lg font-bold">{report.reason}</h2></div><div className="flex gap-2"><Badge variant={report.status === "aberta" ? "destructive" : "secondary"}>{statusLabel[report.status] || report.status}</Badge>{report.is_archived && <Badge variant="outline">Arquivada</Badge>}</div></div><div className="rounded-lg bg-slate-50 p-4"><p className="whitespace-pre-line text-sm font-medium">{target(report)}</p>{evidenceImages.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{evidenceImages.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label="Abrir imagem denunciada em tamanho original"><img src={url} alt="Imagem anexada ao conteúdo denunciado" loading="lazy" className="h-32 w-full rounded-md border object-cover" /></a>)}</div>}{report.message_attachment_url && <a className="mt-2 block text-sm text-primary underline" href={report.message_attachment_url} target="_blank" rel="noreferrer">Ver anexo da mensagem denunciada</a>}{report.post_id && <p className="mt-2 text-xs text-muted-foreground">Publicação #{report.post_id}{report.post_removed_at ? " · já removida da exibição pública" : ""}</p>}</div><div className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Denunciado:</span> {report.reported_user_name || "Indisponível"}{hidden && <span className="ml-2 text-amber-700">· perfil oculto</span>}{blocked && <span className="ml-2 text-red-700">· conta bloqueada</span>}</p><p><span className="text-muted-foreground">Enviado por:</span> {report.reporter_name}</p></div>{report.details && <p className="rounded-lg border p-3 text-sm"><strong>Relato:</strong> {report.details}</p>}<label className="block space-y-2 text-sm font-medium">Nota interna da análise<Textarea value={notes[report.id] ?? report.review_note ?? ""} maxLength={2000} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Registre as evidências e o motivo das ações." /></label>{Array.isArray(report.events) && report.events.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Histórico da análise ({report.events.length})</summary><ol className="mt-3 space-y-3 border-l pl-4">{report.events.map((event: CaseRow, index: number) => <li key={`${report.id}-${index}`} className="text-xs"><p className="font-semibold">{statusLabel[event.status] || event.status} · {event.moderator_name}</p><p className="text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</p>{event.note && <p className="mt-1 whitespace-pre-line">{event.note}</p>}</li>)}</ol></details>}
          <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><div className="flex flex-wrap gap-2">{!archived && <>{report.post_id && !report.post_removed_at && <Button variant="outline" size="sm" disabled={busy} onClick={() => void moderate(report, "remove_post")}><Trash2 className="mr-1 h-4 w-4" />Remover publicação</Button>}{report.reported_user_id && !hidden && <Button variant="outline" size="sm" disabled={busy} onClick={() => void moderate(report, "hide_user", 7)}><EyeOff className="mr-1 h-4 w-4" />Ocultar perfil por 7 dias</Button>}{report.reported_user_id && blocked ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void moderate(report, "unblock_user")}><Undo2 className="mr-1 h-4 w-4" />Desbloquear/restaurar perfil</Button> : report.reported_user_id && <Button variant="outline" size="sm" disabled={busy} onClick={() => void moderate(report, "block_user")}><UserRoundX className="mr-1 h-4 w-4" />Bloquear conta</Button>}</>}</div><div className="flex flex-wrap justify-end gap-2">{!archived && <><Button variant="outline" disabled={busy} onClick={() => void update(report, "em_analise")}>Marcar em análise</Button><Button variant="outline" disabled={busy} onClick={() => void update(report, "ignorada")}>Encerrar sem ação</Button><Button disabled={busy} onClick={() => void update(report, "resolvida")}>{busy ? "Salvando..." : "Concluir análise"}</Button></>}{archived ? <Button variant="outline" disabled={busy} onClick={() => void archiveReport(report, false)}><Undo2 className="mr-2 h-4 w-4" />Restaurar à fila</Button> : ["resolvida", "ignorada"].includes(report.status) && <Button variant="outline" disabled={busy} onClick={() => void archiveReport(report, true)}><Archive className="mr-2 h-4 w-4" />Arquivar caso</Button>}</div></div>
        </CardContent></Card>;
      })}</div> : <EmptyQueue label={archived ? "denúncias arquivadas" : "denúncias"} /> : tab === "servicos" ? issues.length ? <div className="space-y-4">{issues.map((issue) => <Card key={issue.id}><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Caso de serviço #{issue.id} · {new Date(issue.created_at).toLocaleString("pt-BR")}</p><h2 className="mt-1 text-lg font-bold">{issue.service_title || "Serviço contratado"}</h2></div><Badge variant={issue.status === "aberta" ? "destructive" : "secondary"}>{statusLabel[issue.status] || issue.status}</Badge></div><p className="rounded-lg bg-amber-50 p-4 text-sm">{issue.issue_details}</p><div className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Cliente:</span> {issue.customer_name}</p><p><span className="text-muted-foreground">Profissional:</span> {issue.professional_name}</p><p><span className="text-muted-foreground">Relatado por:</span> {issue.reporter_name || "Cliente"}</p><p><span className="text-muted-foreground">Valor combinado:</span> {money(Number(issue.agreed_amount || 0))}</p></div><label className="block space-y-2 text-sm font-medium">Nota interna da análise<Textarea value={notes[issue.id] ?? issue.review_note ?? ""} maxLength={2000} onChange={(event) => setNotes((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="Registre o contato feito e o encaminhamento combinado." /></label><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={workingId === Number(issue.id)} onClick={() => void updateIssue(issue, "em_analise")}>Marcar em análise</Button><Button variant="outline" disabled={workingId === Number(issue.id)} onClick={() => void updateIssue(issue, "ignorada")}>Encerrar sem ação</Button><Button disabled={workingId === Number(issue.id)} onClick={() => void updateIssue(issue, "resolvida")}>Concluir análise</Button></div></CardContent></Card>)}</div> : <EmptyQueue label="problemas de serviços" /> : appeals.length ? <div className="space-y-4">{appeals.map((appeal) => <Card key={appeal.id}><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Recurso #{appeal.id} · {new Date(appeal.created_at).toLocaleString("pt-BR")}</p><h2 className="mt-1 text-lg font-bold">{appeal.user_name}</h2><p className="text-sm text-muted-foreground">{appeal.user_email}</p></div><Badge variant={appeal.status === "aberta" ? "destructive" : "secondary"}>{statusLabel[appeal.status] || appeal.status}</Badge></div><p className="whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm">{appeal.message}</p><label className="block space-y-2 text-sm font-medium">Resposta da equipe<Textarea value={appealNotes[appeal.id] ?? appeal.admin_note ?? ""} maxLength={2000} onChange={(event) => setAppealNotes((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="Explique a decisão para a pessoa." /></label><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={workingId === Number(appeal.id)} onClick={() => void updateAppeal(appeal, "em_analise")}>Marcar em análise</Button><Button variant="outline" disabled={workingId === Number(appeal.id)} onClick={() => void updateAppeal(appeal, "negada")}>Negar recurso</Button><Button disabled={workingId === Number(appeal.id)} onClick={() => void updateAppeal(appeal, "resolvida")}>Aprovar e desbloquear</Button></div></CardContent></Card>)}</div> : <EmptyQueue label="recursos de contas" />}
    </>}
  </main></div>;
}

function EmptyQueue({ label }: { label: string }) { return <Card><CardContent className="p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-green-700" /><h2 className="mt-3 font-semibold">Fila vazia</h2><p className="mt-1 text-sm text-muted-foreground">Não há {label} neste filtro.</p></CardContent></Card>; }
