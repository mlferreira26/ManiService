import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CheckCircle2,
  MapPin,
  MessageCircle,
  Search,
  Star,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Professional = {
  id: number;
  name: string;
  role?: string;
  specialty?: string;
  city?: string;
  state?: string;
  rating?: number;
  total_reviews?: number;
  total_services?: number;
  verified?: boolean;
  avatar_url?: string;
  distance_km?: number | null;
  followers_count?: number;
};
export default function ProfessionalsLive() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [items, setItems] = useState<Professional[]>([]);
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get("search") || ""
  );
  const [city, setCity] = useState("");
  const [role, setRole] = useState("todos");
  const [radius, setRadius] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search).get("search") || "");
  }, [location]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (city) params.set("city", city);
    if (role !== "todos") params.set("role", role);
    if (radius) params.set("radius", radius);
    setLoading(true);
    const timer = window.setTimeout(
      () =>
        api
          .searchUsers(params.toString())
          .then(({ users }) => {
            if (active) setItems(users as Professional[]);
          })
          .catch(error => {
            if (active) toast.error(error.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      250
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, city, role, radius]);
  function initials(name: string) {
    return name
      .split(" ")
      .filter(Boolean)
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  async function startChat(id: number) {
    try {
      const { conversation } = await api.createConversation(id);
      setLocation(`/mensagens?conversation=${conversation.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar a conversa."
      );
    }
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100">
      <SiteHeader />
      <main className="container py-8 md:py-12">
        <div className="mb-7">
          <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
            Talentos da sua região
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            Encontre pessoas
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Use a barra de pesquisa no topo para buscar por nome, profissão ou
            serviço. Refine os resultados por tipo de conta, cidade e distância,
            respeitando a região e a privacidade de cada pessoa.
          </p>
        </div>
        <Card className="my-6 rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              <span>Tipo de conta</span>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={role}
                onChange={e => setRole(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="profissional">Profissionais</option>
                <option value="usuario">Consumidores</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Cidade</span>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  aria-label="Filtrar por cidade"
                  className="pl-9"
                  placeholder="Qualquer cidade próxima"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                />
              </div>
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Distância máxima (km)</span>
              <Input
                aria-label="Distância máxima em quilômetros"
                type="number"
                min="1"
                max="300"
                placeholder="Minha distância configurada"
                value={radius}
                onChange={e => setRadius(e.target.value)}
              />
            </label>
          </CardContent>
        </Card>
        {loading ? (
          <p className="py-12 text-center text-muted-foreground">
            Buscando pessoas na região...
          </p>
        ) : items.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="p-10 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-blue-600" />
              <p className="font-semibold">
                Nenhuma conta pública encontrada nesta região.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente outra busca na barra do topo ou ajuste cidade e distância.
                A pessoa também precisa permitir a busca nas configurações de
                privacidade.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              <b className="text-slate-900">{items.length}</b>{" "}
              {items.length === 1 ? "conta encontrada" : "contas encontradas"}
            </p>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map(person => (
                <Card
                  key={person.id}
                  className="overflow-hidden rounded-2xl border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-gradient-to-br from-blue-700 to-cyan-500 text-lg font-bold text-white shadow-md">
                        {person.avatar_url ? (
                          <img
                            src={person.avatar_url}
                            alt={`Foto de ${person.name}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials(person.name)
                        )}
                      </div>
                      {person.distance_km != null && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {person.distance_km} km
                        </span>
                      )}
                    </div>
                    <h2 className="mt-4 text-lg font-bold">{person.name}</h2>
                    <p className="mt-1 flex items-center gap-1 text-sm font-medium text-blue-700">
                      <Wrench className="h-4 w-4" />
                      {person.role === "profissional"
                        ? person.specialty || "Profissional"
                        : "Consumidor"}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-sm text-slate-500">
                      <MapPin className="h-4 w-4" />
                      {[person.city, person.state]
                        .filter(Boolean)
                        .join(" - ") || "Localização não informada"}
                    </p>
                    {person.role === "profissional" && (
                      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                        <span className="flex items-center gap-1 text-sm font-semibold">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {Number(person.rating || 0).toFixed(1)}{" "}
                          <span className="font-normal text-slate-500">
                            ({person.total_reviews || 0} avaliações)
                          </span>
                        </span>
                        <span className="text-xs text-slate-500">
                          {person.followers_count || 0} seguidores
                        </span>
                      </div>
                    )}
                    <div className="mt-4">
                      <Link href={`/perfil/${person.id}`}>
                        <a>
                          <Button
                            className="w-full rounded-xl"
                            variant="outline"
                          >
                            Ver perfil
                          </Button>
                        </a>
                      </Link>
                      {user?.role === "usuario" &&
                        person.role === "profissional" && (
                          <Button
                            className="mt-2 w-full rounded-xl"
                            onClick={() => void startChat(person.id)}
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Conversar
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
