import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, Heart, MapPin, MessageCircle, Star, UserRoundPlus, Users } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import PostComments from "@/components/PostComments";
import ReportButton from "@/components/ReportButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Data = Record<string, any>;
type Review = { id: number; reviewer_name: string; rating: number; comment?: string | null; created_at: string };
type Post = { id: number; title: string; description: string; image_url?: string | null; created_at: string; likes_count?: number; comments_count?: number; liked_by_me?: boolean };
const dateLabel = (value: string) => new Date(value).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

export default function ProfessionalProfile() {
  const [, params] = useRoute<{ id: string }>("/perfil/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const id = Number(params?.id);
  const [profile, setProfile] = useState<Data | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const isOwnProfile = Number(user?.id) === id;

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id < 1) { setLoading(false); return; }
    try {
      const result = await api.professionalProfile(id);
      setProfile(result.profile);
      setPosts(result.posts as Post[]);
      setReviews(result.reviews as Review[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o perfil.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function toggleFollow() {
    if (!profile || working) return;
    setWorking(true);
    try {
      const result = profile.is_following ? await api.unfollowUser(id) : await api.followUser(id);
      setProfile((current) => current ? { ...current, is_following: result.following, followers_count: Math.max(0, Number(current.followers_count || 0) + (result.following ? 1 : -1)) } : current);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar suas conexões."); }
    finally { setWorking(false); }
  }

  async function startChat() {
    try {
      const { conversation } = await api.createConversation(id);
      setLocation(`/mensagens?conversation=${conversation.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a conversa."); }
  }

  async function reactToPost(post: Post) {
    try {
      const result = await api.reactToPost(post.id);
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked_by_me: result.liked, likes_count: result.likesCount } : item));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reagir à publicação."); }
  }

  function updateCommentCount(postId: number, commentsCount: number) {
    setPosts((current) => current.map((item) => item.id === postId ? { ...item, comments_count: commentsCount } : item));
  }

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-6xl py-8 md:py-10">
    <Link href={isOwnProfile ? "/perfil" : "/profissionais"}><a className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />{isOwnProfile ? "Voltar ao meu perfil" : "Voltar aos profissionais"}</a></Link>
    {loading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando perfil...</CardContent></Card> : !profile ? <Card><CardContent className="p-10 text-center">Este perfil não está disponível.</CardContent></Card> : <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden"><div className="h-32 bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-400" />
          <CardContent className="relative px-5 pb-6 md:px-8"><div className="-mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-slate-900 text-3xl font-bold text-white shadow-lg sm:h-24 sm:w-24">{profile.avatar_url ? <img src={String(profile.avatar_url)} alt={`Foto de ${profile.name}`} className="h-full w-full object-cover" /> : String(profile.name || "MS").split(" ").filter(Boolean).map((part: string) => part[0]).slice(0, 2).join("").toUpperCase()}</div><div className="min-w-0 pt-12 pb-1"><div className="flex flex-wrap items-center gap-2"><h1 className="max-w-full break-words text-xl leading-tight sm:text-2xl sm:leading-normal">{profile.name}</h1>{profile.verified && <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Verificado</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{profile.role === "profissional" ? profile.specialty || "Profissional" : "Consumidor"}</p></div></div>
            {!isOwnProfile && <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => void toggleFollow()} disabled={working}><UserRoundPlus className="mr-2 h-4 w-4" />{profile.is_following ? "Seguindo" : "Seguir"}</Button>{user?.role === "usuario" && profile.role === "profissional" && <Button onClick={() => void startChat()}><MessageCircle className="mr-2 h-4 w-4" />Iniciar chat</Button>}<ReportButton targetType="profile" targetId={id} /></div>}
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-[1fr_auto]"><div><p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{profile.professional_description || profile.bio || "Este profissional ainda não adicionou uma apresentação."}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{(profile.neighborhood || profile.city || profile.state) && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{[profile.neighborhood, profile.city, profile.state].filter(Boolean).join(", ")}</span>}</div></div><div className="flex gap-5 rounded-2xl bg-slate-50 px-5 py-3 text-center"><div><p className="flex items-center justify-center gap-1 text-xl font-bold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(profile.rating || 0).toFixed(1)}</p><p className="text-xs text-muted-foreground">{Number(profile.total_reviews || 0)} avaliações</p></div><div><p className="text-xl font-bold text-primary">{Number(profile.total_services || 0)}</p><p className="text-xs text-muted-foreground">serviços</p></div></div></div>
        </CardContent></Card>

        <aside className="space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" />Conexões</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{Number(profile.followers_count || 0)}</p><p className="text-xs text-muted-foreground">seguidores</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{Number(profile.following_count || 0)}</p><p className="text-xs text-muted-foreground">seguindo</p></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Avaliações recentes</CardTitle></CardHeader><CardContent className="space-y-4">{reviews.length ? reviews.slice(0, 4).map((review) => <div key={review.id} className="border-b pb-3 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{review.reviewer_name}</p><span className="flex items-center gap-1 text-sm text-amber-600">{review.rating.toFixed(1)} <Star className="h-3.5 w-3.5 fill-current" /></span></div>{review.comment && <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>}<p className="mt-1 text-xs text-muted-foreground">{dateLabel(review.created_at)}</p></div>) : <p className="text-sm text-muted-foreground">Este perfil ainda não recebeu avaliações.</p>}</CardContent></Card>
        </aside>
      </div>

      {!isOwnProfile && profile.role === "profissional" && <Card className="mt-6"><CardContent className="p-4 text-sm text-muted-foreground">As avaliações ficam disponíveis depois que um cliente confirma a conclusão de um serviço e avalia a experiência em “Acompanhar serviços”.</CardContent></Card>}

      <section className="mt-8"><div className="mb-4 flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-primary" /><div><h2 className="text-2xl font-bold">Linha do tempo</h2><p className="text-sm text-muted-foreground">Publicações de {profile.role === "profissional" ? "este profissional" : "este consumidor"}.</p></div></div>{posts.length ? <div className="space-y-4">{posts.map((post) => <Card key={post.id} className="overflow-hidden"><CardContent className="p-5">{post.image_url && <img src={post.image_url} alt={post.title} className="mb-4 max-h-96 w-full rounded-xl object-cover" />}<div className="mb-2 flex items-center justify-between"><p className="text-xs text-muted-foreground">{dateLabel(post.created_at)}</p>{!isOwnProfile && <ReportButton targetType="post" targetId={post.id} compact />}</div><h3 className="text-lg font-bold">{post.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{post.description}</p><div className="mt-4 border-t pt-3"><Button type="button" variant={post.liked_by_me ? "default" : "outline"} size="sm" onClick={() => void reactToPost(post)}><Heart className={`mr-2 h-4 w-4 ${post.liked_by_me ? "fill-current" : ""}`} />{post.likes_count || 0} {post.likes_count === 1 ? "reação" : "reações"}</Button><PostComments postId={post.id} count={post.comments_count} onCountChange={(count) => updateCommentCount(post.id, count)} /></div></CardContent></Card>)}</div> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Este perfil ainda não publicou na linha do tempo.</CardContent></Card>}</section>
    </>}
  </main></div>;
}
