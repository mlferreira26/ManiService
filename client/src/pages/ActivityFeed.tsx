import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BriefcaseBusiness, Heart, MapPin, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import PostComments from "@/components/PostComments";
import ReportButton from "@/components/ReportButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

type FeedItem = { kind: "publicacao" | "pedido"; id: number; title: string; description: string; image_url?: string | null; created_at: string; author_id: number; author_name: string; author_role: string; avatar_url?: string | null; city?: string | null; state?: string | null; likes_count: number; comments_count?: number; liked_by_me: boolean };
const dateLabel = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.feed().then(({ items: feed }) => setItems(feed as FeedItem[]))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar o feed."))
      .finally(() => setLoading(false));
  }, []);
  async function react(item: FeedItem) {
    try {
      const result = await api.reactToPost(item.id);
      setItems((current) => current.map((entry) => entry.kind === "publicacao" && entry.id === item.id ? { ...entry, liked_by_me: result.liked, likes_count: result.likesCount } : entry));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reagir à publicação."); }
  }
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-3xl py-8 md:py-12">
    <div className="mb-7"><p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-700"><BriefcaseBusiness className="h-4 w-4" /> ManiService em movimento</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Serviços acontecendo</h1><p className="mt-2 text-muted-foreground">Veja publicações e pedidos recentes compartilhados com a comunidade.</p></div>
    {loading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando atividades...</CardContent></Card> : items.length ? <div className="space-y-4">{items.map((item) => <Card key={`${item.kind}-${item.id}`} className="overflow-hidden"><CardContent className="p-0">{item.image_url && <img src={item.image_url} alt={item.title} className="max-h-[28rem] w-full object-cover" />}<div className="p-5"><div className="flex items-start justify-between gap-3"><div><Link href={`/perfil/${item.author_id}`}><a className="font-semibold hover:text-primary hover:underline">{item.author_name}</a></Link><p className="mt-1 text-xs text-muted-foreground">{item.kind === "pedido" ? "Novo pedido" : "Nova publicação"} · {dateLabel(item.created_at)}</p></div><div className="flex items-center gap-2">{(item.city || item.state) && <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[item.city, item.state].filter(Boolean).join(", ")}</span>}<ReportButton targetType={item.kind === "pedido" ? "request" : "post"} targetId={item.id} compact /></div></div><h2 className="mt-4 text-lg font-bold">{item.title}</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p><div className="mt-4 border-t pt-4">{item.kind === "publicacao" ? <><Button size="sm" variant={item.liked_by_me ? "default" : "outline"} onClick={() => void react(item)}><Heart className={`mr-2 h-4 w-4 ${item.liked_by_me ? "fill-current" : ""}`} />{item.likes_count} {item.likes_count === 1 ? "reação" : "reações"}</Button><PostComments postId={item.id} count={item.comments_count} onCountChange={(count) => setItems((current) => current.map((entry) => entry.kind === "publicacao" && entry.id === item.id ? { ...entry, comments_count: count } : entry))} /></> : <Link href="/comunidades"><a><Button size="sm"><MessageCircle className="mr-2 h-4 w-4" />Ver pedidos e propostas</Button></a></Link>}</div></div></CardContent></Card>)}</div> : <Card><CardContent className="p-10 text-center"><h2 className="font-semibold">Ainda não há atividades públicas</h2><p className="mt-1 text-sm text-muted-foreground">Quando houver novos pedidos ou publicações públicas, eles aparecerão aqui.</p></CardContent></Card>}
  </main></div>;
}
