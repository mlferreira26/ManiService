import { useEffect, useState } from "react";
import { CalendarDays, Clock3, MapPin, Navigation, ShieldAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

type Row = Record<string, any>;
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Data a combinar";
const expectedEnd = (value?: string | null, days?: number | null) => { if (!value || !days) return null; const date = new Date(value); date.setDate(date.getDate() + Number(days)); return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date); };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels: Record<string, string> = { agendado: "Agendado", em_execucao: "Em andamento", aguardando_confirmacao: "Aguardando confirmação", concluido: "Concluído", em_disputa: "Problema em análise", cancelado: "Cancelado" };
const arrivalLabels: Record<string, string> = { agendado: "Aguardando atualização de chegada", a_caminho: "Profissional a caminho", cheguei: "Profissional informou que chegou" };

export default function ServicesTracking() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [issueFor, setIssueFor] = useState<number | null>(null);
  const [issueText, setIssueText] = useState("");
  useEffect(() => { api.bookings().then(({ bookings: rows }) => setBookings(rows)).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar os serviços.")).finally(() => setLoading(false)); }, []);

  async function update(id: number, action: () => Promise<{ booking: Row }>, success: string) {
    setBusyId(id);
    try { const { booking } = await action(); setBookings((rows) => rows.map((row) => Number(row.id) === id ? { ...row, ...booking } : row)); toast.success(success); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o serviço."); }
    finally { setBusyId(null); }
  }

  const professional = user?.role === "profissional";
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container py-8 md:py-10">
    <div className="mb-7"><Badge className="mb-3 gap-1 bg-blue-100 text-blue-700"><CalendarDays className="h-3.5 w-3.5" />Acompanhamento</Badge><h1 className="text-3xl font-bold tracking-tight">Acompanhar serviços</h1><p className="mt-2 max-w-2xl text-muted-foreground">Datas, etapas e combinações dos serviços contratados ficam reunidas aqui.</p></div>
    {loading ? <Card><CardContent className="p-8 text-muted-foreground">Carregando serviços...</CardContent></Card> : bookings.length ? <div className="grid gap-4 lg:grid-cols-2">{bookings.map((booking) => <Card key={booking.id} className="overflow-hidden"><div className="h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" /><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm text-muted-foreground">{professional ? "Cliente" : "Profissional"}</p><h2 className="break-words text-lg font-bold">{booking.other_user_name || "Contato"}</h2><p className="mt-1 text-sm text-muted-foreground">{booking.title || "Serviço contratado"}</p></div><Badge variant={booking.status === "concluido" ? "default" : "secondary"}>{labels[booking.status] || booking.status}</Badge></div>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Início: {dateLabel(booking.scheduled_at)}</span></div><div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Prazo: {booking.estimated_days ? `${booking.estimated_days} dia(s)` : "A combinar"}{expectedEnd(booking.scheduled_at, booking.estimated_days) && <span className="block text-xs text-muted-foreground">Previsão de término: {expectedEnd(booking.scheduled_at, booking.estimated_days)}</span>}</span></div></div>
      {booking.status !== "cancelado" && <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm text-blue-900">{arrivalLabels[booking.arrival_status] || arrivalLabels.agendado}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="text-xl font-bold text-primary">{money(Number(booking.agreed_amount || 0))}</p><p className="text-xs text-muted-foreground">Pagamento: {booking.payment_status === "aguardando_integracao" ? "aguardando integração do Mercado Pago" : booking.payment_status === "pago" ? "confirmado" : "ainda não iniciado"}</p></div><WalletCards className="h-5 w-5 text-blue-500" aria-hidden="true" /></div>
      {booking.issue_details && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Problema informado</p><p className="mt-1 whitespace-pre-wrap">{booking.issue_details}</p></div>}
      <div className="flex flex-wrap gap-2">{professional && ["agendado", "em_execucao"].includes(booking.status) && <><Button size="sm" variant="outline" disabled={busyId === Number(booking.id)} onClick={() => void update(Number(booking.id), () => api.updateBookingArrival(Number(booking.id), "a_caminho"), "Cliente avisado que você está a caminho.")}><Navigation className="mr-2 h-4 w-4" />Estou a caminho</Button><Button size="sm" variant="outline" disabled={busyId === Number(booking.id)} onClick={() => void update(Number(booking.id), () => api.updateBookingArrival(Number(booking.id), "cheguei"), "Cliente avisado que você chegou.")}>Cheguei</Button></>}{professional && booking.status === "agendado" && <Button size="sm" disabled={busyId === Number(booking.id)} onClick={() => void update(Number(booking.id), () => api.startBooking(Number(booking.id)), "Serviço iniciado.")}>Iniciar serviço</Button>}{professional && booking.status === "em_execucao" && <Button size="sm" disabled={busyId === Number(booking.id)} onClick={() => void update(Number(booking.id), () => api.completeBooking(Number(booking.id)), "Conclusão enviada ao cliente.")}>Marcar como concluído</Button>}{!professional && booking.status === "aguardando_confirmacao" && <><Button size="sm" disabled={busyId === Number(booking.id)} onClick={() => void update(Number(booking.id), () => api.confirmBooking(Number(booking.id)), "Conclusão confirmada. O pagamento será ativado após a integração do Mercado Pago.")}>Confirmar conclusão</Button><Button size="sm" variant="outline" onClick={() => { setIssueFor(Number(booking.id)); setIssueText(""); }}><ShieldAlert className="mr-2 h-4 w-4" />Informar problema</Button></>}</div>
      {issueFor === Number(booking.id) && <form className="space-y-2 rounded-xl border bg-slate-50 p-3" onSubmit={(event) => { event.preventDefault(); void update(Number(booking.id), () => api.reportBookingIssue(Number(booking.id), issueText.trim()), "Problema registrado para análise.").then(() => setIssueFor(null)); }}><label className="text-sm font-medium" htmlFor={`issue-${booking.id}`}>Conte o que aconteceu</label><Textarea id={`issue-${booking.id}`} required maxLength={3000} value={issueText} onChange={(event) => setIssueText(event.target.value)} /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setIssueFor(null)}>Cancelar</Button><Button size="sm" disabled={busyId === Number(booking.id)}>Enviar relato</Button></div></form>}
      </CardContent></Card>)}</div> : <Card className="border-dashed border-blue-200 bg-white/85"><CardContent className="p-8 text-center"><h2 className="font-semibold">Nenhum serviço contratado ainda</h2><p className="mt-1 text-sm text-muted-foreground">Quando um orçamento for aceito, o acompanhamento aparecerá aqui.</p></CardContent></Card>}
    <Card className="mt-6 border-blue-100 bg-white/85"><CardContent className="flex items-start gap-3 p-4"><WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">O pagamento e o extrato da Carteira serão ativados após a configuração do Mercado Pago. Esta tela não retém dinheiro; por enquanto, ela acompanha o acordo e a conclusão do serviço.</p></CardContent></Card>
  </main></div>;
}
