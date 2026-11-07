import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { Clock3, Filter, ImagePlus, MapPin, MessageCircle, Plus, Send, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Request = { id: number; user_id: number; category: string; title: string; description: string; location?: string; city?: string; state?: string; image_url?: string; author: string; created_at: string; interested: number; proposals_count: number; status: string };
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function CommunityRequests() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<Request[]>([]);
  const [category, setCategory] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState<number | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const [quoteFor, setQuoteFor] = useState<Request | null>(null);
  const [quote, setQuote] = useState({ amount: "", message: "", estimatedDays: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ category: "Elétrica", title: "", description: "", location: "", city: "", state: "" });
  const [requestImage, setRequestImage] = useState<File | null>(null);
  const [requestImagePreview, setRequestImagePreview] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const isProfessional = user?.role === "profissional";

  async function loadRequests() {
    try {
      const result = await api.serviceRequests();
      setRequests(result.requests as Request[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar os pedidos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadRequests(); }, []);

  const filtered = useMemo(() => {
    const visible = requests.filter((item) => item.status !== "cancelado");
    return category === "Todas" ? visible : visible.filter((item) => item.category.toLowerCase() === category.toLowerCase());
  }, [category, requests]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const imageUrl = requestImage ? (await api.uploadImage(requestImage)).url : null;
      await api.createServiceRequest({ ...form, imageUrl, ...(coordinates || {}) });
      setForm({ category: "Elétrica", title: "", description: "", location: "", city: "", state: "" });
      setRequestImage(null); setRequestImagePreview(null); setCoordinates(null);
      setShowCreate(false);
      await loadRequests();
      toast.success("Pedido publicado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível publicar o pedido."); }
    finally { setSaving(false); }
  }

  function chooseRequestImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolha um arquivo de imagem."); event.target.value = ""; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 5 MB."); event.target.value = ""; return; }
    if (requestImagePreview) URL.revokeObjectURL(requestImagePreview);
    setRequestImage(file); setRequestImagePreview(URL.createObjectURL(file));
  }

  function useRequestLocation() {
    if (!navigator.geolocation) { toast.error("Este navegador não oferece localização."); return; }
    navigator.geolocation.getCurrentPosition((position) => { setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }); toast.success("Localização aproximada adicionada para avisar profissionais próximos."); }, () => toast.error("Não foi possível obter a localização. Confira a permissão do navegador."), { timeout: 10000, maximumAge: 300000 });
  }

  async function startChat(item: Request) {
    if (!user || contactId) return;
    setContactId(item.id);
    try {
      const { conversation } = await api.createConversation(Number(user.id), item.id, Number(item.user_id));
      setLocation(`/mensagens?conversation=${conversation.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível iniciar o chat."); }
    finally { setContactId(null); }
  }

  async function sendQuote(event: FormEvent) {
    event.preventDefault();
    if (!quoteFor || saving) return;
    setSaving(true);
    try {
      const result = await api.sendProposal(quoteFor.id, { amount: Number(quote.amount), message: quote.message.trim(), ...(quote.estimatedDays ? { estimatedDays: Number(quote.estimatedDays) } : {}) });
      setQuoteFor(null);
      setQuote({ amount: "", message: "", estimatedDays: "" });
      setLocation(`/mensagens?conversation=${result.conversation.id}`);
      toast.success("Proposta enviada. A conversa foi aberta.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar a proposta."); }
    finally { setSaving(false); }
  }

  async function deleteRequest(item: Request) {
    if (!window.confirm(`Remover o pedido "${item.title}"?`)) return;
    setDeletingRequestId(item.id);
    try {
      await api.deleteServiceRequest(item.id);
      setRequests((current) => current.filter((request) => request.id !== item.id));
      toast.success("Pedido removido.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover o pedido."); }
    finally { setDeletingRequestId(null); }
  }

  const categories = ["Todas", ...Array.from(new Set(requests.map((item) => item.category).filter(Boolean)))];
  return <div className="min-h-screen bg-slate-50"><SiteHeader /><main className="container py-8 md:py-10">
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><Badge variant="secondary" className="mb-3 gap-1 bg-blue-100 text-blue-700"><Users className="h-3.5 w-3.5" />Comunidade</Badge><h1 className="text-4xl font-bold tracking-tight">Pedidos e oportunidades</h1><p className="mt-2 max-w-2xl text-muted-foreground">Veja pedidos publicados por consumidores. Profissionais podem iniciar uma conversa diretamente com quem publicou.</p></div>{!isProfessional && <Button onClick={() => setShowCreate((open) => !open)}><Plus className="mr-2 h-4 w-4" />Criar pedido</Button>}</div>
    {showCreate && !isProfessional && <Card className="mb-8"><CardContent className="p-5 md:p-7"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">O que você precisa resolver?</h2><p className="text-sm text-muted-foreground">Seu pedido será exibido com os dados da sua conta.</p></div><Button variant="ghost" size="icon" onClick={() => setShowCreate(false)} aria-label="Fechar"><X className="h-4 w-4" /></Button></div><form onSubmit={publish} className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="request-category">Categoria</Label><select id="request-category" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Elétrica</option><option>Pintura</option><option>Hidráulica</option><option>Marcenaria</option><option>Alvenaria</option><option>Outro</option></select></div><div className="space-y-2"><Label htmlFor="request-location">Bairro ou endereço aproximado</Label><Input id="request-location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="request-title">Título</Label><Input id="request-title" required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="request-description">Descrição</Label><Textarea id="request-description" required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="request-city">Cidade</Label><Input id="request-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="request-state">Estado</Label><Input id="request-state" maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })} /></div></div><div className="flex flex-wrap items-center gap-3"><input id="request-image" className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseRequestImage} /><Button type="button" variant="outline" onClick={() => document.getElementById("request-image")?.click()}><ImagePlus className="mr-2 h-4 w-4" />Adicionar foto</Button><Button type="button" variant="outline" onClick={useRequestLocation}><MapPin className="mr-2 h-4 w-4" />Usar localização aproximada</Button><span className="text-xs text-muted-foreground">{coordinates ? "Localização adicionada" : "A localização é opcional"}</span></div>{requestImagePreview && <div className="flex items-start gap-2"><img src={requestImagePreview} alt="Prévia da foto do pedido" className="max-h-48 rounded-xl object-contain" /><Button type="button" variant="ghost" size="icon" aria-label="Remover foto" onClick={() => { setRequestImage(null); setRequestImagePreview(null); }}><X className="h-4 w-4" /></Button></div>}<div className="flex justify-end"><Button disabled={saving}><Send className="mr-2 h-4 w-4" />{saving ? "Publicando..." : "Publicar pedido"}</Button></div></form></CardContent></Card>}
    <div className="mb-5 flex flex-wrap items-center gap-2"><span className="mr-1 inline-flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-primary" />Filtrar</span>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-full border px-3 py-1.5 text-sm transition ${category === item ? "border-primary bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:border-primary/40"}`}>{item}</button>)}</div>
    {loading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando pedidos...</CardContent></Card> : filtered.length ? <div className="grid gap-5 lg:grid-cols-2">{filtered.map((item) => <Card key={item.id} className="overflow-hidden"><CardContent className="p-0">{item.image_url && <img src={item.image_url} alt={item.title} className="h-48 w-full object-cover" />}<div className="p-5"><div className="flex flex-wrap gap-2"><Badge variant="outline">{item.category}</Badge><Badge variant="secondary">{item.status.replaceAll("_", " ")}</Badge></div><h2 className="mt-3 text-lg font-bold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">Publicado por {item.author} · {dateLabel(item.created_at)}</p><p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p><div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">{(item.location || item.city || item.state) && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 text-primary" />{[item.location, item.city, item.state].filter(Boolean).join(", ")}</span>}<span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{Number(item.interested || 0)} interessados</span></div><div className="mt-5 flex items-center justify-between border-t pt-4"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{Number(item.proposals_count || 0)} propostas</span>{isProfessional && Number(item.user_id) !== Number(user?.id) && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={contactId === item.id} onClick={() => void startChat(item)}><MessageCircle className="mr-2 h-4 w-4" />Iniciar chat</Button><Button size="sm" onClick={() => { setQuoteFor(item); setQuote({ amount: "", message: "", estimatedDays: "" }); }}>Enviar proposta</Button></div>}{!isProfessional && Number(item.user_id) === Number(user?.id) && ["aberto", "em_analise"].includes(item.status) && <Button size="sm" variant="outline" disabled={deletingRequestId === item.id} onClick={() => void deleteRequest(item)} className="text-red-600 hover:text-red-700"><Trash2 className="mr-2 h-4 w-4" />{deletingRequestId === item.id ? "Removendo..." : "Remover pedido"}</Button>}</div></div></CardContent></Card>)}</div> : <Card><CardContent className="p-10 text-center"><p className="font-semibold">Nenhum pedido publicado ainda.</p><p className="mt-1 text-sm text-muted-foreground">Quando consumidores publicarem necessidades, elas aparecerão aqui.</p></CardContent></Card>}
    {quoteFor && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"><Card className="w-full max-w-lg"><CardContent className="p-6"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">Enviar proposta</h2><p className="mt-1 text-sm text-muted-foreground">{quoteFor.title} · para {quoteFor.author}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setQuoteFor(null)} aria-label="Fechar"><X className="h-4 w-4" /></Button></div><form onSubmit={sendQuote} className="space-y-4"><div className="space-y-2"><Label htmlFor="quote-amount">Valor (R$)</Label><Input id="quote-amount" type="number" min="0.01" step="0.01" required value={quote.amount} onChange={(event) => setQuote({ ...quote, amount: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="quote-days">Prazo estimado (dias)</Label><Input id="quote-days" type="number" min="1" value={quote.estimatedDays} onChange={(event) => setQuote({ ...quote, estimatedDays: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="quote-message">Mensagem ao cliente</Label><Textarea id="quote-message" required maxLength={5000} value={quote.message} onChange={(event) => setQuote({ ...quote, message: event.target.value })} placeholder="Descreva o serviço, o que está incluído e as condições." /></div><Button className="w-full" disabled={saving}>{saving ? "Enviando..." : "Enviar proposta e abrir conversa"}<Send className="ml-2 h-4 w-4" /></Button></form></CardContent></Card></div>}
  </main></div>;
}
