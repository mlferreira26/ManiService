import { FormEvent, useEffect, useState, type ChangeEvent } from "react";
import { Link } from "wouter";
import { Eye, Heart, MapPin, Pencil, Plus, Save, Star, Trash2, UserRound, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import PostComments from "@/components/PostComments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type ProfileData = Record<string, string | number | boolean | null>;
type ProfilePost = { id: number; title: string; description: string; image_url?: string | null; created_at: string; likes_count?: number; comments_count?: number; liked_by_me?: boolean };
type SocialData = { followers_count: number; following_count: number; reviews: Array<{ id: number; reviewer_name: string; rating: number; comment?: string | null; created_at: string }> };
const emptyProfile: ProfileData = { name: "", phone: "", bio: "", address_line: "", neighborhood: "", city: "", state: "", postal_code: "", specialty: "", professional_description: "", service_radius_km: "", hourly_rate: "" };
const formattedDate = (date: string) => new Date(date).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [social, setSocial] = useState<SocialData | null>(null);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", description: "" });
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.profile(), api.profilePosts()])
      .then(([profileResult, postResult]) => {
        setProfile(profileResult.profile);
        setPosts(postResult.posts as ProfilePost[]);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar seu perfil."))
      .finally(() => setLoading(false));
    if (user?.id) {
      api.professionalProfile(user.id).then((result) => setSocial({ followers_count: Number(result.profile.followers_count || 0), following_count: Number(result.profile.following_count || 0), reviews: result.reviews as SocialData["reviews"] })).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar suas conexões e avaliações."));
    }
  }, [user?.id, user?.role]);

  useEffect(() => () => { if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  useEffect(() => () => { if (postImagePreview?.startsWith("blob:")) URL.revokeObjectURL(postImagePreview); }, [postImagePreview]);

  const set = (key: string, value: string) => setProfile((current) => ({ ...current, [key]: value }));
  const initials = String(profile.name || user?.name || "MS").split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

  async function submitProfile(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const avatarUrl = avatarFile ? (await api.uploadImage(avatarFile)).url : String(profile.avatar_url || "");
      const { profile: saved } = await api.updateProfile({ name: profile.name, phone: profile.phone, bio: profile.bio, addressLine: profile.address_line, neighborhood: profile.neighborhood, city: profile.city, state: profile.state, postalCode: profile.postal_code, avatarUrl, specialty: profile.specialty, professionalDescription: profile.professional_description, serviceRadiusKm: profile.service_radius_km || null, hourlyRate: profile.hourly_rate || null });
      setAvatarFile(null); setAvatarPreview(null);
      setProfile(saved); setMode("preview"); toast.success("Perfil salvo. Veja como ele aparece para outras pessoas.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o perfil."); }
    finally { setSaving(false); }
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Escolha uma imagem PNG, JPG ou WEBP."); event.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A foto deve ter no máximo 5 MB."); event.target.value = ""; return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function publishPost(event: FormEvent) {
    event.preventDefault(); setPublishing(true);
    try {
      const imageUrl = postImageFile ? (await api.uploadImage(postImageFile)).url : undefined;
      const result = await api.createProfilePost({ ...draft, imageUrl });
      setPosts((current) => [result.post as ProfilePost, ...current]);
      setDraft({ title: "", description: "" }); setPostImageFile(null); setPostImagePreview(null); setShowComposer(false);
      toast.success("Publicação adicionada à sua linha do tempo.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível publicar."); }
    finally { setPublishing(false); }
  }

  function choosePostImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolha um arquivo de imagem."); event.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 5 MB."); event.target.value = ""; return; }
    setPostImageFile(file); setPostImagePreview(URL.createObjectURL(file));
  }

  async function reactToPost(post: ProfilePost) {
    try {
      const result = await api.reactToPost(post.id);
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked_by_me: result.liked, likes_count: result.likesCount } : item));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reagir à publicação."); }
  }

  async function deletePost(post: ProfilePost) {
    if (!window.confirm(`Excluir a publicação "${post.title}"?`)) return;
    setDeletingPostId(post.id);
    try {
      await api.deleteProfilePost(post.id);
      setPosts((current) => current.filter((item) => item.id !== post.id));
      toast.success("Publicação excluída.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir a publicação."); }
    finally { setDeletingPostId(null); }
  }

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-5xl py-8 md:py-12">
    {loading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando seu perfil...</CardContent></Card> : mode === "edit" ? <Card><CardHeader className="flex flex-row items-center gap-4"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-primary text-xl font-bold text-primary-foreground">{avatarPreview || profile.avatar_url ? <img src={avatarPreview || String(profile.avatar_url)} alt="Foto do perfil" className="h-full w-full object-cover" /> : initials}</div><div><CardTitle>Editar seus dados</CardTitle><p className="mt-1 text-sm text-muted-foreground">As alterações aparecem no seu perfil depois que você salvar.</p></div></CardHeader><CardContent><form onSubmit={submitProfile} className="space-y-7">
      <section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />Dados pessoais</h2><div className="flex items-center gap-4 md:col-span-2"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">{avatarPreview || profile.avatar_url ? <img src={avatarPreview || String(profile.avatar_url)} alt="Prévia da foto de perfil" className="h-full w-full object-cover" /> : initials}</div><div className="space-y-2"><Label htmlFor="profile-avatar">Foto de perfil</Label><Input id="profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} /><p className="text-xs text-muted-foreground">PNG, JPG ou WEBP · até 5 MB</p></div></div><div className="space-y-2"><Label htmlFor="profile-name">Nome</Label><Input id="profile-name" required value={String(profile.name || "")} onChange={(e) => set("name", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-phone">Telefone</Label><Input id="profile-phone" value={String(profile.phone || "")} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="profile-bio">Sobre você</Label><Textarea id="profile-bio" value={String(profile.bio || "")} onChange={(e) => set("bio", e.target.value)} placeholder="Conte um pouco sobre você" /></div></section>
      <section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" />Localização</h2><div className="space-y-2"><Label htmlFor="profile-city">Cidade</Label><Input id="profile-city" value={String(profile.city || "")} onChange={(e) => set("city", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-state">Estado (UF)</Label><Input id="profile-state" maxLength={2} value={String(profile.state || "")} onChange={(e) => set("state", e.target.value.toUpperCase())} /></div><div className="space-y-2"><Label htmlFor="profile-neighborhood">Bairro</Label><Input id="profile-neighborhood" value={String(profile.neighborhood || "")} onChange={(e) => set("neighborhood", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-postal">CEP</Label><Input id="profile-postal" value={String(profile.postal_code || "")} onChange={(e) => set("postal_code", e.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="profile-address">Endereço</Label><Input id="profile-address" value={String(profile.address_line || "")} onChange={(e) => set("address_line", e.target.value)} /></div></section>
      {user?.role === "profissional" && <section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" />Perfil profissional</h2><div className="space-y-2"><Label htmlFor="profile-specialty">Especialidade</Label><Input id="profile-specialty" value={String(profile.specialty || "")} onChange={(e) => set("specialty", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-rate">Valor por hora (R$)</Label><Input id="profile-rate" type="number" min="0" step="0.01" value={String(profile.hourly_rate || "")} onChange={(e) => set("hourly_rate", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-radius">Raio de atendimento (km)</Label><Input id="profile-radius" type="number" min="1" value={String(profile.service_radius_km || "")} onChange={(e) => set("service_radius_km", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-description">Apresentação profissional</Label><Input id="profile-description" value={String(profile.professional_description || "")} onChange={(e) => set("professional_description", e.target.value)} /></div></section>}
      <div className="flex justify-end border-t pt-5"><Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar e visualizar"}</Button></div>
    </form></CardContent></Card> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden"><div className="h-32 bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-400" /><CardContent className="relative px-5 pb-6 md:px-8"><div className="-mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-slate-900 text-3xl font-bold text-white shadow-lg sm:h-24 sm:w-24">{profile.avatar_url ? <img src={String(profile.avatar_url)} alt="Foto do perfil" className="h-full w-full object-cover" /> : initials}</div><div className="min-w-0 pt-12 pb-1"><h2 className="max-w-full break-words text-xl leading-tight sm:text-2xl sm:leading-normal">{String(profile.name || user?.name || "Seu nome")}</h2><p className="mt-1 text-sm text-muted-foreground">{user?.role === "profissional" ? String(profile.specialty || "Profissional") : "Consumidor Mani Service"}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setMode("edit")}><Pencil className="mr-2 h-4 w-4" />Editar perfil</Button><Link href={`/perfil/${user?.id}`}><a><Button variant="default"><Eye className="mr-2 h-4 w-4" />Ver perfil público</Button></a></Link></div></div>
        <div className="mt-6 grid gap-5 md:grid-cols-[1fr_auto]"><div><p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{String(profile.bio || profile.professional_description || "Adicione uma apresentação em Editar perfil para que as pessoas conheçam você.")}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{(profile.neighborhood || profile.city || profile.state) && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{[profile.neighborhood, profile.city, profile.state].filter(Boolean).join(", ")}</span>}{profile.phone && <span>Telefone: {String(profile.phone)}</span>}</div></div><div className="flex gap-5 rounded-2xl bg-slate-50 px-5 py-3 text-center"><div><p className="flex items-center justify-center gap-1 text-xl font-bold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(profile.rating || 0).toFixed(1)}</p><p className="text-xs text-muted-foreground">{Number(profile.total_reviews || 0)} avaliações</p></div>{user?.role === "profissional" && <div><p className="text-xl font-bold text-primary">{Number(profile.total_services || 0)}</p><p className="text-xs text-muted-foreground">serviços</p></div>}</div></div>
      </CardContent></Card>
      <aside className="space-y-5"><Card><CardHeader><CardTitle className="text-lg">Conexões</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{social?.followers_count ?? "—"}</p><p className="text-xs text-muted-foreground">seguidores</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{social?.following_count ?? "—"}</p><p className="text-xs text-muted-foreground">seguindo</p></div></CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Avaliações recebidas</CardTitle></CardHeader><CardContent className="space-y-4">{social?.reviews.length ? social.reviews.slice(0, 5).map((review) => <div key={review.id} className="border-b pb-3 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{review.reviewer_name}</p><span className="flex items-center gap-1 text-sm text-amber-600">{Number(review.rating).toFixed(1)} <Star className="h-3.5 w-3.5 fill-current" /></span></div><p className="mt-1 text-sm text-muted-foreground">{review.comment || "Avaliação sem comentário."}</p><p className="mt-1 text-xs text-muted-foreground">{formattedDate(review.created_at)}</p></div>) : <p className="text-sm text-muted-foreground">Ainda não há avaliações recebidas.</p>}</CardContent></Card></aside>
      <section className="lg:col-span-2"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Linha do tempo</h2><p className="text-sm text-muted-foreground">Compartilhe novidades e trabalhos realizados.</p></div><Button onClick={() => setShowComposer((open) => !open)}><Plus className="mr-2 h-4 w-4" />Nova publicação</Button></div>
        {showComposer && <Card className="mb-5"><CardContent className="p-5"><form onSubmit={publishPost} className="space-y-3"><Label htmlFor="post-title">Título</Label><Input id="post-title" required maxLength={180} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Trabalho concluído esta semana" /><Label htmlFor="post-description">Descrição</Label><Textarea id="post-description" required maxLength={10000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Conte sobre seu trabalho ou novidade" /><Label htmlFor="post-image">Foto da galeria (opcional)</Label><Input id="post-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePostImage} /><p className="text-xs text-muted-foreground">PNG, JPG ou WEBP · até 5 MB. Em celular, você pode escolher uma imagem da galeria.</p>{postImagePreview && <img src={postImagePreview} alt="Prévia da imagem da publicação" className="max-h-64 rounded-xl object-contain" />}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowComposer(false)}>Cancelar</Button><Button type="submit" disabled={publishing}>{publishing ? "Publicando..." : "Publicar"}</Button></div></form></CardContent></Card>}
        {posts.length === 0 ? <Card><CardContent className="p-8 text-center"><p className="font-semibold">Sua linha do tempo começa aqui</p><p className="mt-1 text-sm text-muted-foreground">Você ainda não publicou nada. Use “Nova publicação” para compartilhar a primeira atualização.</p></CardContent></Card> : <div className="space-y-4">{posts.map((post) => <Card key={post.id} className="overflow-hidden"><CardContent className="p-5">{post.image_url && <img src={post.image_url} alt={post.title} className="mb-4 max-h-96 w-full rounded-xl object-cover" />}<div className="flex items-center justify-between gap-3"><p className="mb-2 text-xs text-muted-foreground">{formattedDate(post.created_at)}</p><Button type="button" variant="ghost" size="sm" disabled={deletingPostId === post.id} onClick={() => void deletePost(post)} className="text-red-600 hover:text-red-700"><Trash2 className="mr-2 h-4 w-4" />{deletingPostId === post.id ? "Excluindo..." : "Excluir"}</Button></div><h3 className="text-lg font-bold">{post.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{post.description}</p><div className="mt-4 border-t pt-3"><Button type="button" variant={post.liked_by_me ? "default" : "outline"} size="sm" onClick={() => void reactToPost(post)}><Heart className={`mr-2 h-4 w-4 ${post.liked_by_me ? "fill-current" : ""}`} />{post.likes_count || 0} {post.likes_count === 1 ? "reação" : "reações"}</Button><PostComments postId={post.id} count={post.comments_count} onCountChange={(count) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments_count: count } : item))} /></div></CardContent></Card>)}</div>}
      </section>
    </div>}
  </main></div>;
}
