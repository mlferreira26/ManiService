import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MapPin, Search, SlidersHorizontal, Star, Users, Wrench } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import SiteHeader from "@/components/SiteHeader";
import { api } from "@/lib/api";

type Professional = { id: number; name: string; specialty: string; city?: string; state?: string; rating: number; total_reviews: number; total_services: number; followers_count?: number; verified: boolean; avatar_url?: string };
const demo: Professional[] = [
  { id: 1, name: "Carlos Eletricista", specialty: "Elétrica residencial", city: "São Paulo", state: "SP", rating: 4.9, total_reviews: 86, total_services: 42, followers_count: 127, verified: true },
  { id: 2, name: "Ana Reformas", specialty: "Pintura e acabamento", city: "São Paulo", state: "SP", rating: 4.8, total_reviews: 54, total_services: 31, followers_count: 98, verified: true },
  { id: 3, name: "João Hidráulica", specialty: "Hidráulica e encanamento", city: "Santo André", state: "SP", rating: 4.7, total_reviews: 39, total_services: 27, followers_count: 65, verified: false },
];

export default function Professionals() {
  const [professionals, setProfessionals] = useState<Professional[]>(demo);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [city, setCity] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category !== "Todas") params.set("category", category);
    if (city) params.set("city", city);
    if (minRating !== "0") params.set("minRating", minRating);
    if (verified) params.set("verified", "true");
    api.professionals(params.toString()).then((result) => { if (active && result.professionals.length) setProfessionals(result.professionals as Professional[]); }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, category, city, minRating, verified]);
  const visible = useMemo(() => professionals.filter((item) => {
    const text = `${item.name} ${item.specialty}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (category === "Todas" || item.specialty.toLowerCase().includes(category.toLowerCase())) && (!city || (item.city || "").toLowerCase().includes(city.toLowerCase())) && Number(item.rating) >= Number(minRating) && (!verified || item.verified);
  }), [professionals, search, category, city, minRating, verified]);
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container py-8 md:py-12"><div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><Badge className="mb-3 gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100"><Search className="h-3.5 w-3.5" /> Encontre quem resolve</Badge><h1 className="text-4xl font-bold tracking-tight">Buscar profissionais</h1><p className="mt-2 max-w-2xl text-muted-foreground">Pesquise por especialidade e encontre profissionais avaliados perto de você.</p></div><Link href="/comunidades"><a><Button variant="outline"><Users className="mr-2 h-4 w-4" />Ver pedidos da comunidade</Button></a></Link></div><Card className="mb-8 border-0 shadow-sm"><CardContent className="grid gap-4 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-end"><div className="space-y-2"><label className="text-sm font-medium">Nome ou especialidade</label><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Ex.: eletricista" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div><div className="space-y-2"><label className="text-sm font-medium">Categoria</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option>Todas</option><option>Elétrica</option><option>Pintura</option><option>Hidráulica</option><option>Marcenaria</option></select></div><div className="space-y-2"><label className="text-sm font-medium">Cidade</label><Input placeholder="Ex.: São Paulo" value={city} onChange={(e) => setCity(e.target.value)} /></div><div className="flex items-center gap-3 md:flex-col md:items-start"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={minRating} onChange={(e) => setMinRating(e.target.value)}><option value="0">Qualquer nota</option><option value="4">4+ estrelas</option><option value="4.5">4,5+ estrelas</option></select><label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verificados</label></div></CardContent></Card><div className="mb-5 flex items-center justify-between"><p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{visible.length}</span> profissionais encontrados</p><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" />Filtros atualizados automaticamente</span></div>{loading && <p className="mb-4 text-sm text-muted-foreground">Atualizando resultados...</p>}<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{visible.map((professional) => <Card key={professional.id} className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"><CardContent className="p-0"><div className="h-20 bg-gradient-to-r from-blue-700 to-cyan-400" /><div className="relative px-5 pb-5"><div className="-mt-8 flex items-end justify-between"><div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-slate-900 text-lg font-bold text-white shadow-sm">{professional.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>{professional.verified && <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle2 className="h-3 w-3" /> Verificado</Badge>}</div><h2 className="mt-4 text-lg font-bold">{professional.name}</h2><p className="mt-1 flex items-center gap-1 text-sm text-primary"><Wrench className="h-3.5 w-3.5" />{professional.specialty}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{professional.city || "Atendimento regional"}{professional.state ? ` - ${professional.state}` : ""}</span><span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(professional.rating || 0).toFixed(1)} ({professional.total_reviews || 0})</span></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-center text-xs"><div><p className="font-bold text-foreground">{professional.total_services || 0}</p><p className="text-muted-foreground">serviços</p></div><div><p className="font-bold text-foreground">{professional.followers_count || 0}</p><p className="text-muted-foreground">seguidores</p></div></div><div className="mt-4 flex gap-2"><Link href="/perfil"><a className="flex-1"><Button className="w-full" variant="outline">Ver perfil</Button></a></Link><Link href="/comunidades"><a><Button size="icon" aria-label="Ver pedidos"><Users className="h-4 w-4" /></Button></a></Link></div></div></CardContent></Card>)}</div>{visible.length === 0 && <Card><CardContent className="p-10 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">Nenhum profissional encontrado</h2><p className="mt-1 text-sm text-muted-foreground">Tente remover um filtro ou buscar por outra especialidade.</p></CardContent></Card>}</main></div>;
}
