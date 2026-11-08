import { ChangeEvent, useEffect, useState } from "react";
import { CalendarDays, Clock3, ImagePlus, MessageCircle, Navigation, ShieldAlert, Star, WalletCards, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

type Row = Record<string, any>;
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Data a combinar";
const expectedEnd = (value?: string | null, days?: number | null) => { if (!value || !days) return null; const date = new Date(value); date.setDate(date.getDate() + Number(days)); return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date); };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels: Record<string, string> = { agendado: "Agendado", em_execucao: "Em andamento", aguardando_confirmacao: "Aguardando confirmação", concluido: "Concluído", em_disputa: "Problema em análise", cancelado: "Cancelado" };
const arrivalLabels: Record<string, string> = { agendado: "Aguardando atualização de chegada", a_caminho: "Profissional informou que está a caminho", cheguei: "Profissional informou que chegou" };

export default function ServicesTracking() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [issueFor, setIssueFor] = useState<number | null>(null);
  const [issueText, setIssueText] = useState("");
  const [finalAmounts, setFinalAmounts] = useState<Record<number, string>>({});
  const [completionPhotos, setCompletionPhotos] = useState<Record<number, File | null>>({});
  const [paidDirectly, setPaidDirectly] = useState<Record<number, boolean>>({});
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({});

  async function loadBookings() {
    const { bookings: rows } = await api.bookings();
    setBookings(rows);
    setFinalAmounts((current) => Object.fromEntries(rows.map((row) => [Number(row.id), current[Number(row.id)] ?? String(row.final_amount ?? row.agreed_amount ?? "")] )));
  }
  useEffect(() => { void loadBookings().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar os serviços.")).finally(() => setLoading(false)); }, []);

  async function update(id: number, action: () => Promise<{ booking: Row }>, success: string) {
    setBusyId(id);
    try { const { booking } = await action(); setBookings((rows) => rows.map((row) => Number(row.id) === id ? { ...row, ...booking } : row)); toast.success(success); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o serviço."); }
    finally { setBusyId(null); }
  }

  async function completeService(booking: Row) {
    const id = Number(booking.id);
    const finalAmount = Number(finalAmounts[id]);
    if (!Number.isFinite(finalAmount) || finalAmount < 0) { toast.error("Informe um valor final válido."); return; }
    setBusyId(id);
    try {
      const photo = completionPhotos[id];
      const completionImageUrl = photo ? (await api.uploadImage(photo)).url : undefined;
      const { booking: updated } = await api.completeBooking(id, { finalAmount, completionImageUrl });
      setBookings((rows) => rows.map((row) => Number(row.id) === id ? { ...row, ...updated } : row));
      setCompletionPhotos((current) => ({ ...current, [id]: null }));
      toast.success("Conclusão e valor enviados ao cliente. A atualização também apareceu no chat.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir o serviço."); }
    finally { setBusyId(null); }
  }

  async function submitReview(booking: Row) {
    const id = Number(booking.id);
    setBusyId(id);
    try {
      await api.createReview({ professionalId: Number(booking.professional_id), bookingId: id, rating: ratings[id] || 5, comment: reviewComments[id]?.trim() || undefined });
      setBookings((rows) => rows.map((row) => Number(row.id) === id ? { ...row, reviewed_by_me: true } : row));
      toast.success("Avaliação do serviço enviada ao perfil do profissional.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar a avaliação."); }
    finally { setBusyId(null); }
  }

  function choosePhoto(id: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolha um arquivo de imagem."); event.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A foto deve ter no máximo 5 MB."); event.target.value = ""; return; }
    setCompletionPhotos((current) => ({ ...current, [id]: file }));
  }

  const professional = user?.role === "profissional";
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container py-8 md:py-10">
    <div className="mb-7"><Badge className="mb-3 gap-1 bg-blue-100 text-blue-700"><CalendarDays className="h-3.5 w-3.5" />Acompanhamento</Badge><h1 className="text-3xl font-bold tracking-tight">Acompanhar serviços</h1><p className="mt-2 max-w-2xl text-muted-foreground">Datas, etapas, valor combinado e conclusão dos serviços ficam reunidos aqui.</p></div>
    {loading ? <Card><CardContent className="p-8 text-muted-foreground">Carregando serviços...</CardContent></Card> : bookings.length ? <div className="grid gap-4 lg:grid-cols-2">{bookings.map((booking) => {
      const id = Number(booking.id);
      const amount = Number(booking.final_amount ?? booking.agreed_amount ?? 0);
      const changedAmount = booking.final_amount != null && Number(booking.final_amount) !== Number(booking.agreed_amount);
      return <Card key={booking.id} className="overflow-hidden"><div className="h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" /><CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm text-muted-foreground">{professional ? "Cliente" : "Profissional"}</p><h2 className="break-words text-lg font-bold">{booking.other_user_name || "Contato"}</h2><p className="mt-1 text-sm text-muted-foreground">{booking.title || "Serviço contratado"}</p></div><Badge variant={booking.status === "concluido" ? "default" : "secondary"}>{labels[booking.status] || booking.status}</Badge></div>
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Início: {dateLabel(booking.scheduled_at)}</span></div><div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Prazo: {booking.estimated_days ? `${booking.estimated_days} dia(s)` : "A combinar"}{expectedEnd(booking.scheduled_at, booking.estimated_days) && <span className="block text-xs text-muted-foreground">Previsão de término: {expectedEnd(booking.scheduled_at, booking.estimated_days)}</span>}</span></div></div>
        {booking.status !== "cancelado" && <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm text-blue-900">{arrivalLabels[booking.arrival_status] || arrivalLabels.agendado}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="text-xl font-bold text-primary">{money(amount)}</p><p className="text-xs text-muted-foreground">{changedAmount ? "Valor final proposto pelo profissional" : "Valor do serviço"}</p>{booking.status === "aguardando_confirmacao" && changedAmount && <p className="mt-1 text-xs text-amber-800">O cliente precisa conferir e confirmar este valor final.</p>}</div><Link href={booking.conversation_id ? `/mensagens?conversation=${booking.conversation_id}` : "/mensagens"}><a><Button size="sm" variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Abrir chat</Button></a></Link></div>
        {booking.completion_image_url && booking.status !== "agendado" && <img src={booking.completion_image_url} alt="Foto do serviço concluído" className="max-h-64 w-full rounded-xl border object-cover" />}
        {booking.issue_details && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Problema informado</p><p className="mt-1 whitespace-pre-wrap">{booking.issue_details}</p>{booking.issue_review_status === "resolvida" && <p className="mt-2 text-amber-900">A equipe concluiu a análise. Você pode confirmar o serviço ou continuar a conversa pelo chat.</p>}</div>}
        <div className="flex flex-wrap gap-2">{professional && ["agendado", "em_execucao"].includes(booking.status) && <><Button size="sm" variant="outline" disabled={busyId === id} onClick={() => void update(id, () => api.updateBookingArrival(id, "a_caminho"), "O cliente foi avisado pelo acompanhamento e pelo chat.")}><Navigation className="mr-2 h-4 w-4" />Estou a caminho</Button><Button size="sm" variant="outline" disabled={busyId === id} onClick={() => void update(id, () => api.updateBookingArrival(id, "cheguei"), "O cliente foi avisado pelo acompanhamento e pelo chat.")}>Cheguei</Button></>}{professional && booking.status === "agendado" && <Button size="sm" disabled={busyId === id} onClick={() => void update(id, () => api.startBooking(id), "Serviço iniciado. A atualização também apareceu no chat.")}>Iniciar serviço</Button>}{professional && booking.status === "em_execucao" && <div className="w-full space-y-3 rounded-xl border bg-white p-3"><label className="block space-y-1 text-sm font-medium" htmlFor={`final-amount-${id}`}>Valor final do serviço<Input id={`final-amount-${id}`} type="number" min="0" step="0.01" value={finalAmounts[id] ?? ""} onChange={(event) => setFinalAmounts((current) => ({ ...current, [id]: event.target.value }))} /></label><p className="text-xs text-muted-foreground">Se o valor mudou em relação ao orçamento, o cliente verá a diferença antes de confirmar.</p><div className="flex flex-wrap items-center gap-2"><input id={`completion-photo-${id}`} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => choosePhoto(id, event)} /><Button size="sm" variant="outline" type="button" onClick={() => document.getElementById(`completion-photo-${id}`)?.click()}><ImagePlus className="mr-2 h-4 w-4" />{completionPhotos[id] ? "Trocar foto" : "Adicionar foto do serviço"}</Button>{completionPhotos[id] && <span className="max-w-48 truncate text-xs text-muted-foreground">{completionPhotos[id]?.name}</span>}{completionPhotos[id] && <Button size="icon" variant="ghost" aria-label="Remover foto" onClick={() => setCompletionPhotos((current) => ({ ...current, [id]: null }))}><X className="h-4 w-4" /></Button>}<p className="basis-full text-xs text-muted-foreground">A foto será enviada no chat e publicada na sua linha do tempo quando o cliente confirmar a conclusão.</p><Button size="sm" disabled={busyId === id} onClick={() => void completeService(booking)}>{busyId === id ? "Enviando..." : "Marcar como concluído"}</Button></div></div>}{!professional && booking.status === "aguardando_confirmacao" && <div className="w-full space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-sm font-medium">Confira o serviço e o valor final antes de confirmar.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={Boolean(paidDirectly[id])} onChange={(event) => setPaidDirectly((current) => ({ ...current, [id]: event.target.checked }))} /><span>Também confirmo que já paguei diretamente ao profissional.</span></label><p className="text-xs text-muted-foreground">O ManiService não processa pagamentos. Se marcar, o recebimento será anotado na Carteira do profissional como informado por você.</p><Button size="sm" disabled={busyId === id} onClick={() => void update(id, () => api.confirmBooking(id, Boolean(paidDirectly[id])), paidDirectly[id] ? "Conclusão confirmada; o recebimento foi anotado na Carteira do profissional." : "Conclusão confirmada. O profissional pode registrar o recebimento quando acontecer.")}>Confirmar conclusão e valor</Button><Button size="sm" variant="outline" onClick={() => { setIssueFor(id); setIssueText(""); }}><ShieldAlert className="mr-2 h-4 w-4" />Informar problema</Button></div>}</div>
        {issueFor === id && <form className="space-y-2 rounded-xl border bg-slate-50 p-3" onSubmit={(event) => { event.preventDefault(); void update(id, () => api.reportBookingIssue(id, issueText.trim()), "Problema registrado; a equipe foi avisada e o relato apareceu no chat.").then(() => setIssueFor(null)); }}><label className="text-sm font-medium" htmlFor={`issue-${id}`}>Conte o que aconteceu</label><Textarea id={`issue-${id}`} required maxLength={3000} value={issueText} onChange={(event) => setIssueText(event.target.value)} /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setIssueFor(null)}>Cancelar</Button><Button size="sm" disabled={busyId === id}>Enviar relato</Button></div></form>}
        {!professional && booking.status === "concluido" && !booking.reviewed_by_me && <form className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3" onSubmit={(event) => { event.preventDefault(); void submitReview(booking); }}><p className="font-semibold">Avalie o serviço de {booking.other_user_name}</p><div className="flex items-center gap-1" aria-label={`Nota selecionada: ${ratings[id] || 5} de 5`}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRatings((current) => ({ ...current, [id]: value }))} aria-label={`${value} estrelas`}><Star className={`h-6 w-6 ${value <= (ratings[id] || 5) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></button>)}</div><Textarea value={reviewComments[id] || ""} maxLength={2000} onChange={(event) => setReviewComments((current) => ({ ...current, [id]: event.target.value }))} placeholder="Como foi o serviço? (opcional)" /><Button size="sm" disabled={busyId === id}>{busyId === id ? "Enviando..." : "Enviar avaliação ao perfil"}</Button></form>}
        {!professional && booking.status === "concluido" && booking.reviewed_by_me && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Avaliação enviada. Ela aparece no perfil do profissional.</p>}
      </CardContent></Card>;
    })}</div> : <Card className="border-dashed border-blue-200 bg-white/85"><CardContent className="p-8 text-center"><h2 className="font-semibold">Nenhum serviço contratado ainda</h2><p className="mt-1 text-sm text-muted-foreground">Quando um orçamento for aceito, o acompanhamento aparecerá aqui.</p></CardContent></Card>}
    <Card className="mt-6 border-blue-100 bg-white/85"><CardContent className="flex items-start gap-3 p-4"><WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">O ManiService não processa pagamentos nem cobra comissão neste momento. Cliente e profissional combinam o pagamento diretamente; o profissional pode registrar o recebimento na Carteira.</p></CardContent></Card>
  </main></div>;
}
