import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, ClipboardList, MessageCircle, Plus, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

type Row = Record<string, any>;
type Activity = { id: string; title: string; description: string; date: string };
const dateLabel = (value: Date) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(value);
const elapsed = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const platformFee = (value: number) => Math.round(value * 4) / 100;

export default function Dashboard() {
  const { user } = useAuth();
  const professional = user?.role === "profissional";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profile, setProfile] = useState<Row>({});
  const [requests, setRequests] = useState<Row[]>([]);
  const [proposals, setProposals] = useState<Row[]>([]);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [conversations, setConversations] = useState<Row[]>([]);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.profile(), api.serviceRequests(), api.proposals(), api.bookings(), api.conversations()])
      .then(([profileResult, requestResult, proposalResult, bookingResult, conversationResult]) => {
        setProfile(profileResult.profile);
        setRequests(requestResult.requests as Row[]);
        setProposals(proposalResult.proposals);
        setBookings(bookingResult.bookings);
        setConversations(conversationResult.conversations);
      })
      .catch((error) => { setLoadError(true); toast.error(error instanceof Error ? error.message : "Não foi possível carregar os dados do painel."); })
      .finally(() => setLoading(false));
  }, []);

  async function deleteRequest(request: Row) {
    if (!window.confirm(`Remover o pedido "${request.title}"?`)) return;
    setDeletingRequestId(Number(request.id));
    try {
      await api.deleteServiceRequest(Number(request.id));
      setRequests((current) => current.filter((item) => Number(item.id) !== Number(request.id)));
      setProposals((current) => current.filter((item) => Number(item.request_id) !== Number(request.id)));
      toast.success("Pedido removido.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover o pedido."); }
    finally { setDeletingRequestId(null); }
  }

  const myRequests = requests.filter((item) => Number(item.user_id) === Number(user?.id));
  const openRequests = myRequests.filter((item) => ["aberto", "em_analise"].includes(String(item.status)));
  const activeBookings = bookings.filter((item) => item.status !== "cancelado");
  const rating = professional && Number(profile.total_reviews) > 0 ? Number(profile.rating).toFixed(1).replace(".", ",") : "—";
  const metrics = professional
    ? [
        { icon: ClipboardList, label: "Orçamentos enviados", value: proposals.length },
        { icon: MessageCircle, label: "Conversas", value: conversations.length },
        { icon: CalendarDays, label: "Serviços contratados", value: activeBookings.length },
        { icon: Star, label: "Minha avaliação", value: rating },
      ]
    : [
        { icon: ClipboardList, label: "Pedidos abertos", value: openRequests.length },
        { icon: MessageCircle, label: "Orçamentos recebidos", value: proposals.length },
        { icon: CalendarDays, label: "Serviços agendados", value: activeBookings.length },
        { icon: Users, label: "Conversas", value: conversations.length },
      ];
  const activity: Activity[] = [
    ...proposals.map((item) => ({ id: `proposal-${item.id}`, title: professional ? "Orçamento enviado" : "Orçamento recebido", description: `${professional ? item.customer_name || "Cliente" : item.professional_name || "Profissional"} · ${item.title || "Pedido de serviço"}`, date: item.created_at })),
    ...conversations.filter((item) => item.last_message_at).map((item) => ({ id: `message-${item.id}`, title: "Mensagem recente", description: `${item.other_user_name || "Contato"}: ${item.last_message}`, date: item.last_message_at })),
  ].filter((item) => item.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const actions = professional
    ? [{ href: "/comunidades", title: "Encontrar pedidos", desc: "Veja necessidades publicadas por consumidores", icon: Users, tone: "bg-blue-50 text-blue-700" }, { href: "/perfil", title: "Atualizar meu perfil", desc: "Mantenha sua apresentação profissional atualizada", icon: BriefcaseBusiness, tone: "bg-amber-50 text-amber-700" }]
    : [{ href: "/profissionais", title: "Encontrar um profissional", desc: "Pesquise profissionais e veja os perfis", icon: Users, tone: "bg-blue-50 text-blue-700" }, { href: "/perfil", title: "Atualizar meu perfil", desc: "Revise seus dados e sua apresentação", icon: BriefcaseBusiness, tone: "bg-amber-50 text-amber-700" }];

  return <div className="min-h-screen bg-slate-50"><SiteHeader /><main className="min-h-[calc(100dvh-8rem)] bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><div className="container py-8 md:py-12">
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">{dateLabel(new Date())}</p><h1 className="text-4xl font-bold tracking-tight">Olá, {user?.name.split(" ")[0] || ""}</h1><p className="mt-2 text-muted-foreground">Resumo dos dados cadastrados na sua conta.</p></div><Link href="/comunidades"><a><Button><Plus className="mr-2 h-4 w-4" />{professional ? "Ver pedidos" : "Publicar uma necessidade"}</Button></a></Link></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map((metric) => <Metric key={metric.label} icon={metric.icon} label={metric.label} value={loading ? "…" : loadError ? "—" : String(metric.value)} />)}</div>
    {!professional && <section className="mt-8"><h2 className="mb-4 text-xl font-bold">Meus pedidos</h2>{myRequests.length ? <div className="grid gap-4 lg:grid-cols-2">{myRequests.map((request) => <Card key={request.id}><CardContent className="flex items-start justify-between gap-4 p-5"><div className="min-w-0"><Badge variant="secondary">{String(request.status).replaceAll("_", " ")}</Badge><h3 className="mt-2 font-semibold">{request.title}</h3><p className="mt-1 text-sm text-muted-foreground">{Number(request.proposals_count || 0)} propostas recebidas</p></div>{["aberto", "em_analise"].includes(String(request.status)) && <Button variant="outline" size="sm" disabled={deletingRequestId === Number(request.id)} onClick={() => void deleteRequest(request)} className="shrink-0 text-red-600 hover:text-red-700"><Trash2 className="mr-2 h-4 w-4" />{deletingRequestId === Number(request.id) ? "Removendo..." : "Remover"}</Button>}</CardContent></Card>)}</div> : <Card className="border-dashed border-blue-200 bg-white/85"><CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Ainda não há pedidos na sua conta</p><p className="mt-1 max-w-xl text-sm text-muted-foreground">Conte o que precisa ser feito e receba propostas de profissionais da sua região.</p></div><Link href="/comunidades"><a><Button><Plus className="mr-2 h-4 w-4" />Publicar meu primeiro pedido</Button></a></Link></CardContent></Card>}</section>}
    {!professional && <section className="mt-8"><h2 className="mb-4 text-xl font-bold">Orçamentos recebidos</h2>{proposals.length ? <div className="grid gap-4 lg:grid-cols-2">{proposals.map((proposal) => { const amount = Number(proposal.amount || 0); const fee = platformFee(amount); return <Card key={proposal.id}><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{proposal.professional_name || "Profissional"}</p><p className="mt-1 text-sm text-muted-foreground">{proposal.title || "Pedido de serviço"}</p></div><Badge variant={proposal.status === "aceito" ? "default" : "secondary"}>{String(proposal.status || "enviado").replaceAll("_", " ")}</Badge></div><p className="mt-4 text-2xl font-bold text-primary">{money(amount)}</p>{proposal.estimated_days && <p className="mt-1 text-sm text-muted-foreground">Prazo estimado: {proposal.estimated_days} dias</p>}<p className="mt-3 whitespace-pre-line text-sm leading-6">{proposal.message}</p><div className="mt-4 space-y-1 border-t pt-3 text-xs text-muted-foreground"><p>Comissão da plataforma (4%, descontada do repasse): {money(fee)}</p><p>Valor previsto para o profissional: {money(amount - fee)}</p></div><p className="mt-3 text-xs text-muted-foreground">O valor ficará retido pelo PagSeguro até você confirmar a conclusão do serviço. O aceite com pagamento será habilitado após a configuração da conta Marketplace.</p><Button className="mt-4 w-full" disabled>Aceitar orçamento após habilitar PagSeguro</Button></CardContent></Card>; })}</div> : <Card><CardContent className="p-6 text-sm text-muted-foreground">Quando profissionais enviarem propostas aos seus pedidos, elas aparecerão aqui.</CardContent></Card>}</section>}
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]"><div><h2 className="mb-4 text-xl font-bold">Acessos rápidos</h2><div className="grid gap-4 sm:grid-cols-2">{actions.map(({ href, title, desc, icon: Icon, tone }) => <Link key={href} href={href}><a><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="p-5"><div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{desc}</p><span className="mt-5 inline-flex items-center text-sm font-semibold text-primary">Acessar <ArrowUpRight className="ml-1 h-4 w-4" /></span></CardContent></Card></a></Link>)}</div></div>
    <Card><CardHeader><CardTitle className="flex items-center justify-between">Atividade recente <Badge variant="secondary">Da sua conta</Badge></CardTitle></CardHeader><CardContent className="space-y-5">{loading ? <p className="text-sm text-muted-foreground">Carregando atividades...</p> : activity.length ? activity.map((item) => <div key={item.id} className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" /><div className="min-w-0"><p className="text-sm font-semibold">{item.title}</p><p className="text-sm text-muted-foreground">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">{elapsed(item.date)}</p></div></div>) : <div className="py-4 text-sm text-muted-foreground">{loadError ? "Não foi possível carregar as atividades agora." : "Ainda não há atividade registrada na sua conta."}</div>}</CardContent></Card></div>
  </div></main></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: string }) { return <Card><CardContent className="flex items-center gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }
