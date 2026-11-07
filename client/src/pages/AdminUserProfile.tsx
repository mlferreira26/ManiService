import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, MapPin, MessageCircle, MessageSquareText, ShieldCheck, Star, Users } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Detail = { account: Record<string, any>; posts: Array<Record<string, any>>; reviews: Array<Record<string, any>> };
const roleLabel: Record<string, string> = { usuario: "Consumidor", profissional: "Profissional", admin: "Administrador" };
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "Nunca";
const initials = (value?: string) => (value || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function AdminUserProfile() {
  const [, params] = useRoute("/admin/pessoas/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    const id = Number(params?.id);
    if (user?.role !== "admin" || !Number.isInteger(id) || id < 1) { setLoading(false); return; }
    setLoading(true);
    api.adminUser(id)
      .then(setDetail)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar o perfil."))
      .finally(() => setLoading(false));
  }, [params?.id, user?.role]);

  const account = detail?.account;
  async function contactAccount() {
    if (!account || startingChat) return;
    setStartingChat(true);
    try { const { conversation } = await api.adminStartConversation(Number(account.id)); setLocation(`/mensagens?conversation=${conversation.id}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível iniciar o contato."); }
    finally { setStartingChat(false); }
  }
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-5xl space-y-6 py-8 md:py-10">
    <Button asChild variant="ghost" className="-ml-3"><Link href="/admin/pessoas"><ArrowLeft className="mr-2 h-4 w-4" />Voltar para pessoas</Link></Button>
    {user?.role !== "admin" ? <Card><CardContent className="p-8 text-center">Esta área é exclusiva da administração do ManiService.</CardContent></Card> : loading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando perfil...</CardContent></Card> : !account ? <Card><CardContent className="p-10 text-center">Não foi possível encontrar esta conta.</CardContent></Card> : <>
      <Card className="overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-400 sm:h-44" style={account.cover_url ? { backgroundImage: `url("${account.cover_url}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} />
        <CardContent className="relative p-5 sm:p-7">
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
            {account.avatar_url ? <img src={account.avatar_url} alt="" className="h-24 w-24 rounded-2xl border-4 border-white bg-white object-cover shadow sm:h-28 sm:w-28" /> : <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-white bg-blue-600 text-2xl font-bold text-white shadow sm:h-28 sm:w-28">{initials(account.name)}</div>}
            <div className="min-w-0 flex-1 pb-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{account.name}</h1><Badge variant="secondary">{roleLabel[account.role] || account.role}</Badge><Badge className={account.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>{account.is_active ? "Ativa" : "Inativa"}</Badge></div><p className="mt-1 break-all text-sm text-muted-foreground">{account.email}</p></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5">{account.is_public ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{account.is_public ? "Perfil público" : "Perfil privado"}</span>{(account.city || account.state) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{[account.city, account.state].filter(Boolean).join(", ")}</span>}<span>Cadastro: {dateLabel(account.created_at)}</span><span>Último acesso: {dateLabel(account.last_login_at)}</span></div>
          {account.bio && <p className="mt-5 whitespace-pre-wrap text-sm leading-6">{account.bio}</p>}
          {account.role === "profissional" && <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{account.specialty || "Especialidade não informada"}</h2>{account.verified && <Badge className="bg-green-100 text-green-800"><ShieldCheck className="mr-1 h-3 w-3" />Verificado</Badge>}</div>{account.professional_description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{account.professional_description}</p>}</div>}
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm"><span className="rounded-lg bg-slate-50 px-3 py-2"><Users className="mr-1 inline h-4 w-4 text-primary" />{account.followers_count || 0} seguidores · {account.following_count || 0} seguindo</span>{account.role === "profissional" && <span className="rounded-lg bg-slate-50 px-3 py-2"><Star className="mr-1 inline h-4 w-4 text-amber-500" />{Number(account.rating || 0).toFixed(1)} · {account.total_reviews || 0} avaliações · {account.total_services || 0} serviços</span>}{account.is_active && Number(account.id) !== Number(user?.id) && <Button size="sm" onClick={() => void contactAccount()} disabled={startingChat}><MessageCircle className="mr-2 h-4 w-4" />{startingChat ? "Abrindo conversa..." : "Contatar pela equipe"}</Button>}</div>
        </CardContent>
      </Card>
      <section><div className="mb-3"><h2 className="text-xl font-bold">Publicações</h2><p className="text-sm text-muted-foreground">Visíveis nesta ficha administrativa, incluindo publicações privadas.</p></div>{detail.posts.length ? <div className="space-y-3">{detail.posts.map((post) => <Card key={post.id}><CardContent className="p-5">{post.image_url && <img src={post.image_url} alt="Imagem da publicação" className="mb-4 max-h-80 w-full rounded-lg object-cover" />}<div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{post.title}</h3><Badge variant="outline">{post.visibility}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{post.description}</p><p className="mt-3 text-xs text-muted-foreground">{dateLabel(post.created_at)} · {post.likes_count} reações · {post.comments_count} comentários</p></CardContent></Card>)}</div> : <Card><CardContent className="p-5 text-sm text-muted-foreground">Esta conta ainda não tem publicações.</CardContent></Card>}</section>
      <section><div className="mb-3"><h2 className="text-xl font-bold">Avaliações recebidas</h2></div>{detail.reviews.length ? <div className="space-y-3">{detail.reviews.map((review) => <Card key={review.id}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{review.reviewer_name}</p><span className="inline-flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-500" />{review.rating}/5</span></div>{review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}<p className="mt-2 text-xs text-muted-foreground">{dateLabel(review.created_at)}</p></CardContent></Card>)}</div> : <Card><CardContent className="p-5 text-sm text-muted-foreground"><MessageSquareText className="mr-2 inline h-4 w-4" />Esta conta ainda não recebeu avaliações.</CardContent></Card>}</section>
    </>}
  </main></div>;
}
