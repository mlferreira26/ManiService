import { useEffect, useState } from "react";
import { MessageCircle, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";

type Account = Record<string, any>;
const roleLabel: Record<string, string> = { usuario: "Consumidor", profissional: "Profissional", admin: "Administrador" };
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR", { dateStyle: "medium" }) : "Nunca";

export default function AdminUsers() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("todos");
  const [active, setActive] = useState("todos");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startingChatId, setStartingChatId] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: search.trim(), role, active, offset: String(offset) });
      api.adminUsers(params.toString())
        .then((result) => { setAccounts(result.users); setTotal(result.total); })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar as contas."))
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [active, offset, role, search, user?.role]);

  function changeFilter(setter: (value: string) => void, value: string) { setter(value); setOffset(0); }
  async function contactAccount(id: number) {
    setStartingChatId(id);
    try { const { conversation } = await api.adminStartConversation(id); setLocation(`/mensagens?conversation=${conversation.id}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível iniciar o contato."); }
    finally { setStartingChatId(null); }
  }

  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-6xl py-8 md:py-10">
    <div className="mb-7"><Badge className="gap-2 bg-blue-100 text-blue-800 hover:bg-blue-100"><ShieldCheck className="h-3.5 w-3.5" /> Área administrativa</Badge><h1 className="mt-3 text-3xl font-extrabold">Pessoas cadastradas</h1><p className="mt-2 max-w-3xl text-muted-foreground">Consulte todas as contas do ManiService, inclusive as que não aparecem na busca pública por causa da região ou das preferências de privacidade.</p></div>
    {user?.role !== "admin" ? <Card><CardContent className="p-6 text-sm">Esta área é exclusiva da administração do ManiService.</CardContent></Card> : <>
      <Card className="mb-5"><CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(15rem,1fr)_12rem_12rem]"><label className="space-y-2 text-sm font-medium">Buscar por nome ou e-mail<span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} maxLength={100} onChange={(event) => changeFilter(setSearch, event.target.value)} placeholder="Ex.: Otavio ou email@exemplo.com" className="pl-9" /></span></label><label className="space-y-2 text-sm font-medium">Tipo de conta<select value={role} onChange={(event) => changeFilter(setRole, event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="todos">Todos os tipos</option><option value="usuario">Consumidor</option><option value="profissional">Profissional</option><option value="admin">Administrador</option></select></label><label className="space-y-2 text-sm font-medium">Status<select value={active} onChange={(event) => changeFilter(setActive, event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="todos">Todos os status</option><option value="ativos">Ativas</option><option value="inativos">Inativas</option></select></label></CardContent></Card>
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4 text-primary" /><span><strong className="text-foreground">{total}</strong> contas encontradas</span></div>
      {loading ? <Card><CardContent className="p-10 text-center text-muted-foreground">Carregando contas...</CardContent></Card> : accounts.length ? <div className="space-y-3">{accounts.map((account) => <Card key={account.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/pessoas/${account.id}`} className="font-semibold text-primary hover:underline">{account.name}</Link><Badge variant="secondary">{roleLabel[account.role] || account.role}</Badge><Badge className={account.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>{account.is_active ? "Ativa" : "Inativa"}</Badge></div><p className="mt-1 break-all text-sm text-muted-foreground">{account.email}</p><p className="mt-1 text-xs text-muted-foreground">{[account.city, account.state].filter(Boolean).join(", ") || "Localidade não informada"}</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-xs text-muted-foreground sm:text-right"><span>Cadastro</span><span className="font-medium text-foreground">{dateLabel(account.created_at)}</span><span>Último acesso</span><span className="font-medium text-foreground">{dateLabel(account.last_login_at)}</span></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={`/admin/pessoas/${account.id}`}>Abrir perfil</Link></Button>{account.is_active && Number(account.id) !== Number(user?.id) && <Button size="sm" disabled={startingChatId === Number(account.id)} onClick={() => void contactAccount(Number(account.id))}><MessageCircle className="mr-2 h-4 w-4" />{startingChatId === Number(account.id) ? "Abrindo..." : "Contatar"}</Button>}</div></div></CardContent></Card>)}</div> : <Card><CardContent className="p-10 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">Nenhuma conta encontrada</h2><p className="mt-1 text-sm text-muted-foreground">Tente outro nome, e-mail ou filtro.</p></CardContent></Card>}
      <div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Mostrando {accounts.length ? offset + 1 : 0}–{Math.min(offset + accounts.length, total)} de {total}</p><div className="flex gap-2"><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset((current) => Math.max(0, current - 50))}>Anterior</Button><Button variant="outline" disabled={offset + 50 >= total || loading} onClick={() => setOffset((current) => current + 50)}>Próxima</Button></div></div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">Esta lista é visível somente para administradores. Use os dados das contas apenas para operar e proteger o ManiService.</p>
    </>}
  </main></div>;
}
