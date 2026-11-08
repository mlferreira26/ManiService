import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Heart, MapPin, MessageCircle, Sparkles, Star, Wrench } from "lucide-react";
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
const isCompletedWork = (item: FeedItem) => item.kind === "publicacao" && item.title.toLocaleLowerCase("pt-BR").startsWith("serviço concluído:");

export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [professionals, setProfessionals] = useState<FeaturedProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([api.feed(), api.searchUsers("role=profissional")])
      .then(([{ items: feed }, { users }]) => {
        if (!active) return;
        setItems(feed as FeedItem[]);
        setProfessionals((users as FeaturedProfessional[]).slice(0, 4));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar a página principal."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const requests = useMemo(() => items.filter((item) => item.kind === "pedido").slice(0, 5), [items]);
  const completedWorks = useMemo(() => items.filter(isCompletedWork).slice(0, 12), [items]);
  const communityPosts = useMemo(() => items.filter((item) => item.kind === "publicacao" && !isCompletedWork(item)), [items]);

  async function react(item: FeedItem) {
    try {
      const result = await api.reactToPost(item.id);
      setItems((current) => current.map((entry) => entry.kind === "publicacao" && entry.id === item.id ? { ...entry, liked_by_me: result.liked, likes_count: result.likesCount } : entry));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reagir à publicação."); }
  }

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100 text-slate-900">
    <SiteHeader />
    <main className="container max-w-7xl py-7 md:py-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700"><BriefcaseBusiness className="h-4 w-4" /> ManiService em movimento</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Serviços acontecendo</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">Pedidos recentes, profissionais da sua região e trabalhos concluídos pela comunidade.</p></div>
        <Link href="/comunidades"><a><Button className="rounded-xl">Publicar ou encontrar um pedido <ArrowRight className="ml-2 h-4 w-4" /></Button></a></Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
        <section aria-labelledby="recent-requests">
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Oportunidades recentes</p><h2 id="recent-requests" className="mt-1 text-xl font-bold">Pedidos publicados</h2></div><Link href="/comunidades"><a className="shrink-0 text-sm font-semibold text-primary hover:underline">Ver todos</a></Link></div>
          {loading ? <Card><CardContent className="p-8 text-sm text-muted-foreground">Carregando pedidos...</CardContent></Card> : requests.length ? <div className="space-y-3">{requests.map((item) => <Card key={`pedido-${item.id}`} className="group overflow-hidden rounded-2xl border-amber-200/70 shadow-sm transition hover:shadow-md"><CardContent className="relative min-h-40 overflow-hidden p-0 sm:min-h-44">
            {item.image_url ? <img src={item.image_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-25 transition duration-500 group-hover:scale-[1.02]" /> : <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-white to-blue-100" />}
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/70" />
            <div className="relative flex min-h-40 flex-col justify-between gap-4 p-4 sm:min-h-44 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">Pedido aberto</span><span className="text-xs text-muted-foreground">{dateLabel(item.created_at)}</span></div><h3 className="mt-2 line-clamp-2 text-lg font-bold leading-snug">{item.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.description}</p></div>{item.image_url && <img src={item.image_url} alt={`Imagem do pedido: ${item.title}`} className="h-16 w-20 shrink-0 rounded-xl border border-white object-cover shadow sm:h-20 sm:w-28" />}</div>
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600"><Link href={`/perfil/${item.author_id}`}><a className="font-semibold text-slate-800 hover:text-primary hover:underline">{item.author_name}</a></Link>{(item.city || item.state) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[item.city, item.state].filter(Boolean).join(", ")}</span>}</div><div className="flex items-center gap-2"><ReportButton targetType="request" targetId={item.id} compact /><Link href="/comunidades"><a><Button size="sm" variant="outline" className="h-8 rounded-lg bg-white/90">Ver pedido <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></a></Link></div></div>
            </div>
          </CardContent></Card>)}</div> : <Card className="rounded-2xl border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">Ainda não há pedidos recentes</p><p className="mt-1 text-sm text-muted-foreground">Quando alguém publicar um pedido, ele aparecerá aqui.</p><Link href="/comunidades"><a><Button variant="outline" className="mt-4">Explorar comunidades</Button></a></Link></CardContent></Card>}
        </section>

        <aside className="space-y-5">
          <Card className="overflow-hidden rounded-2xl border-blue-200 shadow-sm"><div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" /><CardContent className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-blue-700"><Sparkles className="h-3.5 w-3.5" /> Talentos locais</p><h2 className="mt-1 text-lg font-bold">Profissionais em destaque</h2></div><Link href="/profissionais"><a className="text-xs font-semibold text-primary hover:underline">Ver todos</a></Link></div>
            {loading ? <p className="py-6 text-sm text-muted-foreground">Buscando profissionais...</p> : professionals.length ? <div className="mt-3 divide-y">{professionals.map((professional) => <Link key={professional.id} href={`/perfil/${professional.id}`}><a className="flex items-center gap-3 py-3 first:pt-1 last:pb-1 hover:text-primary"><Avatar className="h-11 w-11 border border-blue-100"><AvatarImage src={professional.avatar_url || undefined} alt="" /><AvatarFallback className="bg-blue-50 text-xs font-bold text-blue-700">{initials(professional.name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="flex items-center gap-1 truncate text-sm font-semibold">{professional.name}{professional.verified && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Perfil verificado" />}</span><span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><Wrench className="h-3 w-3 shrink-0" />{professional.specialty || "Profissional"}{professional.city ? ` · ${professional.city}` : ""}</span></span><span className="flex shrink-0 items-center gap-1 text-xs text-slate-600"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(professional.rating || 0).toFixed(1)}</span></a></Link>)}</div> : <p className="py-6 text-sm text-muted-foreground">Ainda não há profissionais públicos na sua região.</p>}
            <p className="mt-3 border-t pt-3 text-[11px] leading-5 text-muted-foreground">Os destaques são organizados pelos perfis públicos e avaliações. Perfis impulsionados poderão aparecer aqui quando essa função for ativada.</p>
          </CardContent></Card>
          <Card className="rounded-2xl border-slate-200 bg-white/80 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><MessageCircle className="h-5 w-5" /></span><div className="min-w-0"><p className="font-semibold">Converse e combine</p><p className="text-xs text-muted-foreground">Fale diretamente com quem publicou.</p></div></div><Link href="/profissionais"><a><Button variant="outline" size="sm" className="mt-3 w-full">Encontrar profissionais</Button></a></Link></CardContent></Card>
        </aside>
      </div>

      <section className="mt-9" aria-labelledby="completed-work">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Trabalho bem feito</p><h2 id="completed-work" className="mt-1 text-xl font-bold">Serviços concluídos</h2></div>{completedWorks.length > 0 && <span className="text-xs text-muted-foreground">Deslize para ver mais</span>}</div>
        {loading ? <div className="h-52 animate-pulse rounded-2xl bg-white/70" /> : completedWorks.length ? <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">{completedWorks.map((item) => <Link key={`concluido-${item.id}`} href={`/perfil/${item.author_id}`}><a className="group relative h-56 w-[min(82vw,19rem)] shrink-0 snap-start overflow-hidden rounded-2xl bg-gradient-to-br from-blue-800 to-cyan-500 shadow-md sm:w-72">{item.image_url && <img src={item.image_url} alt={item.title.replace(/^Serviço concluído:\s*/i, "")} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent" /><span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[11px] font-semibold text-white"><CheckCircle2 className="h-3.5 w-3.5" />Concluído</span><span className="absolute inset-x-4 bottom-4 text-white"><span className="block text-sm font-bold">{item.author_name}</span><span className="mt-1 block line-clamp-2 text-xs text-white/90">{item.title.replace(/^Serviço concluído:\s*/i, "")}</span><span className="mt-1 block text-[10px] text-white/75">{dateLabel(item.created_at)}</span></span></a></Link>)}</div> : <Card className="rounded-2xl border-dashed bg-white/70"><CardContent className="p-7 text-center text-sm text-muted-foreground">Os trabalhos concluídos com foto aparecerão aqui quando os clientes confirmarem os serviços.</CardContent></Card>}
      </section>

      {communityPosts.length > 0 && <section className="mt-9" aria-labelledby="community-posts"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Da comunidade</p><h2 id="community-posts" className="mt-1 text-xl font-bold">Novidades e trabalhos</h2></div><span className="text-xs text-muted-foreground">Publicações recentes</span></div><div className="grid gap-4 md:grid-cols-2">{communityPosts.map((item) => <Card key={`publicacao-${item.id}`} className="overflow-hidden rounded-2xl shadow-sm"><CardContent className="p-0">{item.image_url && <img src={item.image_url} alt={item.title} className="max-h-64 w-full object-cover" />}<div className="p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/perfil/${item.author_id}`}><a className="font-semibold hover:text-primary hover:underline">{item.author_name}</a></Link><p className="mt-1 text-xs text-muted-foreground">Publicação · {dateLabel(item.created_at)}</p></div><ReportButton targetType="post" targetId={item.id} compact /></div><h3 className="mt-3 font-bold">{item.title}</h3><p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p><div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"><Button size="sm" variant={item.liked_by_me ? "default" : "outline"} onClick={() => void react(item)}><Heart className={`mr-2 h-4 w-4 ${item.liked_by_me ? "fill-current" : ""}`} />{item.likes_count} {item.likes_count === 1 ? "reação" : "reações"}</Button><PostComments postId={item.id} count={item.comments_count} onCountChange={(count) => setItems((current) => current.map((entry) => entry.kind === "publicacao" && entry.id === item.id ? { ...entry, comments_count: count } : entry))} /></div></div></CardContent></Card>)}</div></section>}
    </main>
  </div>;
}
