import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Report = Record<string, any>;
const statusLabel: Record<string, string> = { aberta: "Aberta", em_analise: "Em análise", resolvida: "Resolvida", ignorada: "Encerrada sem ação" };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminModeration() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [issues, setIssues] = useState<Report[]>([]);
  const [tab, setTab] = useState<"denuncias" | "servicos">(() => new URLSearchParams(window.location.search).get("tab") === "servicos" ? "servicos" : "denuncias");
  const [filter, setFilter] = useState("todas");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "denuncias") { const result = await api.adminReports(filter); setReports(result.reports); }
      else { const result = await api.adminServiceIssues(filter); setIssues(result.issues); }
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar a fila de análise."); }
    finally { setLoading(false); }
  }, [filter, tab]);
  useEffect(() => { if (user?.role === "admin") void load(); else setLoading(false); }, [load, user?.role]);

  async function update(report: Report, status: string) {
    setWorkingId(Number(report.id));
    try { await api.updateAdminReport(Number(report.id), status, notes[report.id] || ""); toast.success("Análise registrada."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a análise."); }
    finally { setWorkingId(null); }
  }

  async function updateIssue(issue: Report, status: string) {
    setWorkingId(Number(issue.id));
    try { await api.updateAdminServiceIssue(Number(issue.id), status, notes[issue.id] || ""); toast.success("Análise do serviço registrada."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a análise."); }
    finally { setWorkingId(null); }
  }

  const target = (report: Report) => report.message_body ? `Mensagem: ${report.message_body}` : report.post_title ? `Publicação: ${report.post_title}\n${report.post_description || ""}` : report.request_title ? `Pedido: ${report.request_title}\n${report.request_description || ""}` : `Perfil de ${report.reported_user_name || "usuário indisponível"}`;

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-5xl py-8 md:py-10">
    <div className="mb-7"><Badge className="gap-2 bg-blue-100 text-blue-800 hover:bg-blue-100"><ShieldCheck className="h-3.5 w-3.5" /> Ferramentas internas</Badge><h1 className="mt-3 text-3xl font-extrabold">Denúncias e segurança</h1><p className="mt-2 max-w-3xl text-muted-foreground">Revise o contexto, registre a decisão e mantenha uma trilha de análise. Uma denúncia sozinha não suspende contas automaticamente.</p></div>
    {user?.role !== "admin" ? <Card><CardContent className="flex items-center gap-3 p-6"><ShieldAlert className="h-5 w-5 text-amber-700" /><p className="text-sm">Esta área é exclusiva da equipe de moderação.</p></CardContent></Card> : <>
      <div className="mb-5 flex flex-wrap gap-2"><Button variant={tab === "denuncias" ? "default" : "outline"} onClick={() => setTab("denuncias")}>Denúncias de contas e conteúdo</Button><Button variant={tab === "servicos" ? "default" : "outline"} onClick={() => setTab("servicos")}><CalendarDays className="mr-2 h-4 w-4" />Problemas de serviços</Button></div>
      <label className="mb-5 block max-w-xs space-y-2 text-sm font-medium">Filtrar {tab === "denuncias" ? "denúncias" : "problemas de serviços"}<select value={filter} onChange={(event) => setFilter(event.target.value)} className="flex h-11 w-full rounded-md border border-input bg-white px-3"><option value="todas">Todas</option><option value="aberta">Abertas</option><option value="em_analise">Em análise</option><option value="resolvida">Resolvidas</option><option value="ignorada">Encerradas sem ação</option></select></label>
      {loading ? <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando fila...</CardContent></Card> : tab === "denuncias" ? reports.length ? <div className="space-y-4">{reports.map((report) => <Card key={report.id}><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Denúncia #{report.id} · {new Date(report.created_at).toLocaleString("pt-BR")}</p><h2 className="mt-1 text-lg font-bold">{report.reason}</h2></div><Badge variant={report.status === "aberta" ? "destructive" : "secondary"}>{statusLabel[report.status] || report.status}</Badge></div><div className="rounded-lg bg-slate-50 p-4"><p className="whitespace-pre-line text-sm font-medium">{target(report)}</p>{report.message_attachment_url && <a className="mt-2 block text-sm text-primary underline" href={report.message_attachment_url} target="_blank" rel="noreferrer">Ver anexo da mensagem denunciada</a>}</div><div className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Denunciado:</span> {report.reported_user_name || "Indisponível"}</p><p><span className="text-muted-foreground">Enviado por:</span> {report.reporter_name}</p></div>{report.details && <p className="rounded-lg border p-3 text-sm"><strong>Relato:</strong> {report.details}</p>}<label className="block space-y-2 text-sm font-medium">Nota interna da análise<Textarea value={notes[report.id] ?? report.review_note ?? ""} maxLength={2000} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Registre fatos revisados e justificativa da decisão." /></label>{Array.isArray(report.events) && report.events.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Histórico da análise ({report.events.length})</summary><ol className="mt-3 space-y-3 border-l pl-4">{report.events.map((event: Record<string, any>, index: number) => <li key={`${report.id}-${index}`} className="text-xs"><p className="font-semibold">{statusLabel[event.status] || event.status} · {event.moderator_name}</p><p className="text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</p>{event.note && <p className="mt-1 whitespace-pre-line">{event.note}</p>}</li>)}</ol></details>}<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={workingId === Number(report.id)} onClick={() => void update(report, "em_analise")}>Marcar em análise</Button><Button variant="outline" disabled={workingId === Number(report.id)} onClick={() => void update(report, "ignorada")}>Encerrar sem ação</Button><Button disabled={workingId === Number(report.id)} onClick={() => void update(report, "resolvida")}>{workingId === Number(report.id) ? "Salvando..." : "Concluir análise"}</Button></div></CardContent></Card>)}</div> : <EmptyQueue label="denúncias" /> : issues.length ? <div className="space-y-4">{issues.map((issue) => <Card key={issue.id}><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Caso de serviço #{issue.id} · {new Date(issue.created_at).toLocaleString("pt-BR")}</p><h2 className="mt-1 text-lg font-bold">{issue.service_title || "Serviço contratado"}</h2></div><Badge variant={issue.status === "aberta" ? "destructive" : "secondary"}>{statusLabel[issue.status] || issue.status}</Badge></div><p className="rounded-lg bg-amber-50 p-4 text-sm">{issue.issue_details}</p><div className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Cliente:</span> {issue.customer_name}</p><p><span className="text-muted-foreground">Profissional:</span> {issue.professional_name}</p><p><span className="text-muted-foreground">Relatado por:</span> {issue.reporter_name || "Cliente"}</p><p><span className="text-muted-foreground">Valor combinado:</span> {money(Number(issue.agreed_amount || 0))}</p></div>{issue.review_note && <p className="rounded-lg border p-3 text-sm"><strong>Nota anterior:</strong> {issue.review_note}</p>}<label className="block space-y-2 text-sm font-medium">Nota interna da análise<Textarea value={notes[issue.id] ?? issue.review_note ?? ""} maxLength={2000} onChange={(event) => setNotes((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="Registre o contato feito e o encaminhamento combinado." /></label><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={workingId === Number(issue.id)} onClick={() => void updateIssue(issue, "em_analise")}>Marcar em análise</Button><Button variant="outline" disabled={workingId === Number(issue.id)} onClick={() => void updateIssue(issue, "ignorada")}>Encerrar sem ação</Button><Button disabled={workingId === Number(issue.id)} onClick={() => void updateIssue(issue, "resolvida")}>{workingId === Number(issue.id) ? "Salvando..." : "Concluir análise"}</Button></div></CardContent></Card>)}</div> : <EmptyQueue label="problemas de serviços" />}
    </>}
  </main></div>;
}

function EmptyQueue({ label }: { label: string }) { return <Card><CardContent className="p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-green-700" /><h2 className="mt-3 font-semibold">Fila vazia</h2><p className="mt-1 text-sm text-muted-foreground">Não há {label} neste filtro.</p></CardContent></Card>; }
