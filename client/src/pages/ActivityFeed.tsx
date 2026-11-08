import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Heart, Image as ImageIcon, MapPin, MessageCircle, Newspaper, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import PostComments from "@/components/PostComments";
import ReportButton from "@/components/ReportButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

type FeedItem = { kind: "publicacao" | "pedido"; id: number; title: string; description: string; image_url?: string | null; created_at: string; author_id: number; author_name: string; author_role: string; avatar_url?: string | null; city?: string | null; state?: string | null; likes_count: number; comments_count?: number; liked_by_me: boolean };
type FeaturedProfessional = { id: number; name: string; specialty?: string | null; city?: string | null; state?: string | null; avatar_url?: string | null; verified?: boolean; rating?: number; total_reviews?: number; total_services?: number };
const dateLabel = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [professionals, setProfessionals] = useState<FeaturedProfessional[]>([]);
  const [completedWorks, setCompletedWorks] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([api.feed(), api.searchUsers("role=profissional"), api.completedWork()])
      .then(([{ items: feed }, { users }, { items: work }]) => {
        if (!active) return;
        setItems(feed as FeedItem[]);
        setProfessionals((users as FeaturedProfessional[]).slice(0, 4));
        setCompletedWorks(work as FeedItem[]);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Comunidade."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const requests = useMemo(() => items.filter((item) => item.kind === "pedido").slice(0, 5), [items]);
  async function react(item: FeedItem) {
    try {
      const result = await api.reactToPost(item.id);
      setItems((current) => current.map((entry) => entry.kind === "publicacao" && entry.id === item.id ? { ...entry, liked_by_me: result.liked, likes_count: result.likesCount } : entry));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reagir à publicação."); }
  }

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100 text-slate-900">
    <SiteHeader />
    <main className="container max-w-[1500px] py-6 md:py-9">
      <div className="relative mb-4 flex flex-col items-center gap-3 sm:min-h-10 sm:flex-row sm:justify-center">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700"><BriefcaseBusiness className="h-4 w-4" /> ManiService em movimento</p>
        <Link href="/comunidades"><a className="sm:absolute sm:right-0"><Button className="rounded-xl">Publicar pedido <ArrowRight className="ml-2 h-4 w-4" /></Button></a></Link>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(15rem,0.85fr)_minmax(28rem,1.55fr)_minmax(17rem,0.9fr)]">
        <aside className="order-2 space-y-3 lg:order-1" aria-labelledby="recent-requests">
          <div className="flex items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Oportunidades locais</p><h2 id="recent-requests" className="mt-1 text-lg font-bold">Pedidos recentes</h2></div><Link href="/comunidades"><a className="shrink-0 text-xs font-semibold text-primary hover:underline">Ver todos</a></Link></div>
          {loading ? <Card><CardContent className="space-y-3 p-4"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></CardContent></Card> : requests.length ? requests.map((item) => <Link key={`recent-${item.id}`} href="/comunidades"><a className="group block"><Card className="overflow-hidden rounded-2xl border-amber-200/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="p-0"><div className="relative h-24 overflow-hidden bg-gradient-to-br from-amber-100 via-blue-50 to-cyan-100">{item.image_url && <img src={item.image_url} alt={`Foto do pedido: ${item.title}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" /><span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-800">Pedido recente</span></div><div className="p-3"><h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:text-primary">{item.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p><div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="truncate">{item.author_name}</span>{item.city && <span className="inline-flex shrink-0 items-center gap-1"><MapPin className="h-3 w-3" />{item.city}</span>}</div></div></CardContent></Card></a></Link>) : <Card className="rounded-2xl border-dashed bg-white/75"><CardContent className="p-5 text-center"><BriefcaseBusiness className="mx-auto h-6 w-6 text-amber-600" /><p className="mt-2 text-sm font-semibold">Novos pedidos aparecerão aqui</p><p className="mt-1 text-xs text-muted-foreground">Veja as oportunidades que a comunidade publicar.</p></CardContent></Card>}
          <Link href="/comunidades"><a><Button variant="outline" className="w-full rounded-xl bg-white/80" size="sm">Explorar pedidos <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></a></Link>
        </aside>

        <section className="order-1 min-w-0 space-y-4 lg:order-2" aria-labelledby="community-feed">
          <div className="rounded-2xl border border-blue-100 bg-white/75 px-4 py-3 shadow-sm"><div className="flex items-center gap-2"><Newspaper className="h-4 w-4 text-primary" /><div><h2 id="community-feed" className="font-bold">Serviços acontecendo</h2><p className="text-xs text-muted-foreground">Publicações e pedidos recentes da comunidade</p></div></div></div>
          {loading ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Carregando o feed...</CardContent></Card> : items.length ? <div className="space-y-4">{items.map((item) => <Card key={`${item.kind}-${item.id}`} className="overflow-hidden rounded-2xl shadow-sm"><CardContent className="p-0">{item.image_url && <img src={item.image_url} alt={item.title} className="max-h-[28rem] w-full object-cover" />}<div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/perfil/${item.author_id}`}><a className="font-semibold hover:text-primary hover:underline">{item.author_name}</a></Link><p className="mt-1 text-xs text-muted-foreground">{item.kind === "pedido" ? "Pedido publicado" : "Publicação"} · {dateLabel(item.created_at)}</p></div><div className="flex shrink-0 items-center gap-2">{(item.city || item.state) && <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><MapPin className="h-3.5 w-3.5" />{[item.city, item.state].filter(Boolean).join(", ")}</span>}<ReportButton targetType={item.kind === "pedido" ? "request" : "post"} targetId={item.id} compact /></div></div><h3 className="mt-3 text-lg font-bold">{item.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p>{(item.city || item.state) && <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground sm:hidden"><MapPin className="h-3.5 w-3.5" />{[item.city, item.state].filter(Boolean).join(", ")}</p>}<div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">{item.kind === "publicacao" ? <><Button size="sm" variant={item.liked_by_me ? "default" : "outline"} onClick={() => void react(item)}><Heart className={`mr-2 h-4 w-4 ${item.liked_by_me ? "fill-current" : ""}`} />{item.likes_count} {item.likes_count === 1 ? "reação" : "reações"}</Button><PostComments postId={item.id} count={item.comments_count} onCountChange={(count) => setItems((current) => current.map((entry) => entry.kind === "publicacao" && entry.id === item.id ? { ...entry, comments_count: count } : entry))} /></> : <Link href="/comunidades"><a><Button size="sm" variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Ver pedido</Button></a></Link>}</div></div></CardContent></Card>)}</div> : <Card className="rounded-2xl"><CardContent className="p-10 text-center"><MessageCircle className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-semibold">O feed está começando</h3><p className="mt-1 text-sm text-muted-foreground">Quando houver publicações e pedidos públicos, eles aparecerão aqui.</p></CardContent></Card>}
        </section>

        <aside className="order-3 space-y-5" aria-label="Profissionais e trabalhos em destaque">
          <Card className="overflow-hidden rounded-2xl border-blue-200 shadow-sm"><div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" /><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-blue-700"><Sparkles className="h-3 w-3" /> Talentos locais</p><h2 className="mt-1 text-base font-bold">Profissionais em destaque</h2></div><Link href="/profissionais"><a className="shrink-0 text-[11px] font-semibold text-primary hover:underline">Ver todos</a></Link></div>{loading ? <p className="py-5 text-xs text-muted-foreground">Buscando profissionais...</p> : professionals.length ? <div className="mt-2 divide-y">{professionals.map((professional) => <Link key={professional.id} href={`/perfil/${professional.id}`}><a className="flex items-center gap-2.5 py-2.5 first:pt-2 hover:text-primary"><Avatar className="h-10 w-10 border border-blue-100"><AvatarImage src={professional.avatar_url || undefined} alt="" /><AvatarFallback className="bg-blue-50 text-[10px] font-bold text-blue-700">{initials(professional.name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="flex items-center gap-1 truncate text-xs font-semibold">{professional.name}{professional.verified && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Perfil verificado" />}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{professional.specialty || "Profissional"}{professional.city ? ` · ${professional.city}` : ""}</span></span><span className="flex shrink-0 items-center gap-0.5 text-[10px] text-slate-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(professional.rating || 0).toFixed(1)}</span></a></Link>)}</div> : <p className="py-5 text-xs text-muted-foreground">Ainda não há profissionais públicos próximos.</p>}<p className="mt-2 border-t pt-2 text-[10px] leading-4 text-muted-foreground">Destaques locais; perfis impulsionados poderão ganhar prioridade quando a função estiver ativa.</p></CardContent></Card>

          <section aria-labelledby="completed-work"><div className="mb-2 flex items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Trabalho bem feito</p><h2 id="completed-work" className="mt-1 text-base font-bold">Serviços concluídos</h2></div>{completedWorks.length > 1 && <span className="text-[10px] text-muted-foreground">Deslize</span>}</div>{loading ? <div className="h-24 animate-pulse rounded-2xl bg-white/70" /> : completedWorks.length ? <div className="space-y-2">{completedWorks.map((item) => <Link key={`concluido-${item.id}`} href={`/perfil/${item.author_id}`}><a className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-emerald-100 bg-white/90 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100"><ImageIcon className="absolute inset-0 m-auto h-6 w-6 text-blue-400" /><img src={item.image_url || undefined} alt={item.title.replace(/^Serviço concluído:\s*/i, "")} onError={(event) => { event.currentTarget.style.display = "none"; }} className="relative h-full w-full object-cover transition duration-300 group-hover:scale-105" /><span className="absolute left-1 top-1 rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[8px] font-semibold text-white">Concluído</span></div><span className="min-w-0 py-1"><span className="block truncate text-xs font-bold group-hover:text-primary">{item.title.replace(/^Serviço concluído:\s*/i, "")}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">Por {item.author_name}</span>{item.city && <span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.city}{item.state ? `, ${item.state}` : ""}</span>}</span></a></Link>)}</div> : <Card className="rounded-2xl border-dashed bg-white/75"><CardContent className="p-4 text-xs text-muted-foreground">Os serviços com foto aparecerão aqui quando forem concluídos e confirmados.</CardContent></Card>}</section>
        </aside>
      </div>
    </main>
  </div>;
}
