import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, MapPin, MessageCircle, Search, Star, Wrench } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Professional = { id: number; name: string; specialty: string; city?: string; state?: string; rating?: number; total_reviews?: number; total_services?: number; verified?: boolean; avatar_url?: string };
export default function ProfessionalsLive() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [items, setItems] = useState<Professional[]>([]);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") || "");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(); if (search) params.set("search", search); if (city) params.set("city", city);
    const timer = window.setTimeout(() => api.professionals(params.toString()).then(({ professionals }) => { if (active) setItems(professionals as Professional[]); }).catch((error) => { if (active) toast.error(error.message); }).finally(() => { if (active) setLoading(false); }), 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, city]);
  function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase(); }
  async function startChat(id: number) {
    try { const { conversation } = await api.createConversation(id); setLocation(`/mensagens?conversation=${conversation.id}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a conversa."); }
  }
  return <div className="min-h-screen bg-[#f7f9fc]"><SiteHeader /><main className="container py-8 md:py-12"><div className="mb-7"><p className="text-sm font-bold uppercase tracking-widest text-amber-700">Talentos da sua região</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Encontre quem resolve</h1><p className="mt-2 max-w-2xl text-muted-foreground">Conheça o trabalho, a localização e as avaliações dos profissionais. Depois, converse para combinar os detalhes.</p></div><Card className="my-6 rounded-2xl border-slate-200 shadow-sm"><CardContent className="grid gap-3 p-4 md:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>Serviço ou profissional</span><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Buscar por nome ou especialidade" className="pl-9" placeholder="Ex.: eletricista" value={search} onChange={(e) => setSearch(e.target.value)} /></div></label><label className="space-y-2 text-sm font-medium"><span>Cidade</span><div className="relative"><MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Filtrar por cidade" className="pl-9" placeholder="Ex.: Campinas" value={city} onChange={(e) => setCity(e.target.value)} /></div></label></CardContent></Card>{loading ? <p className="py-12 text-center text-muted-foreground">Buscando profissionais...</p> : items.length === 0 ? <Card className="rounded-2xl"><CardContent className="p-10 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-blue-600" /><p className="font-semibold">Nenhum profissional encontrado por enquanto.</p><p className="mt-1 text-sm text-muted-foreground">Tente outro serviço ou cidade. Você também pode publicar um pedido para receber propostas.</p><Link href="/comunidades"><a><Button className="mt-5">Publicar um pedido</Button></a></Link></CardContent></Card> : <><p className="mb-4 text-sm text-slate-500"><b className="text-slate-900">{items.length}</b> {items.length === 1 ? "profissional encontrado" : "profissionais encontrados"}</p><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((person) => <Card key={person.id} className="overflow-hidden rounded-2xl border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" /><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-gradient-to-br from-blue-700 to-cyan-500 text-lg font-bold text-white shadow-md">{person.avatar_url ? <img src={person.avatar_url} alt={`Foto de ${person.name}`} className="h-full w-full object-cover" /> : initials(person.name)}</div>{person.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Verificado</span>}</div><h2 className="mt-4 text-lg font-bold">{person.name}</h2><p className="mt-1 flex items-center gap-1 text-sm font-medium text-blue-700"><Wrench className="h-4 w-4" />{person.specialty}</p><p className="mt-2 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-4 w-4" />{[person.city, person.state].filter(Boolean).join(" - ") || "Localização não informada"}</p><div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><span className="flex items-center gap-1 text-sm font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(person.rating || 0).toFixed(1)} <span className="font-normal text-slate-500">({person.total_reviews || 0} avaliações)</span></span><span className="text-xs text-slate-500">{person.total_services || 0} serviços</span></div><div className="mt-4 flex gap-2"><Link href={`/perfil/${person.id}`}><a className="flex-1"><Button className="w-full rounded-xl" variant="outline">Ver perfil</Button></a></Link>{user?.role === "usuario" && <Button className="flex-1 rounded-xl" onClick={() => void startChat(person.id)}><MessageCircle className="mr-2 h-4 w-4" />Conversar</Button>}</div></CardContent></Card>)}</div></>}</main></div>;
}
