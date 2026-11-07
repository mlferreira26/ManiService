import { Bell, BriefcaseBusiness, ChevronDown, LayoutDashboard, LogOut, Menu, MessageCircle, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

export default function SiteHeader() {
  const [location, setLocation] = useLocation();
  const { user, loading, logout } = useAuth();
  const appLinks = [
    { href: "/profissionais", label: "Buscar profissionais" },
    { href: "/comunidades", label: "Comunidades", icon: Users },
    { href: "/mensagens", label: "Mensagens", icon: MessageCircle },
    { href: "/perfil", label: "Meu perfil", icon: BriefcaseBusiness },
  ];
  const connected = Boolean(user);
  return <header className="sticky top-0 z-50 border-b border-border/80 bg-white/95 backdrop-blur">
    <div className="container flex min-h-16 items-center justify-between gap-4">
      <Link href={connected ? "/painel" : "/"}><a className="flex items-center gap-2 font-bold text-primary"><span className="flex h-9 w-10 items-center justify-center rounded-xl bg-primary text-sm tracking-tight text-primary-foreground shadow-sm">MS</span><span className="text-xl tracking-tight">Mani Service</span></a></Link>
      {connected && <nav className="hidden items-center gap-1 xl:flex">{appLinks.map(({ href, label }) => <Link key={href} href={href}><a className={`rounded-lg px-3 py-2 text-sm transition ${location === href ? "bg-blue-50 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</a></Link>)}<Link href="/painel"><a className={`rounded-lg px-3 py-2 text-sm transition ${location === "/painel" ? "bg-blue-50 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>Painel</a></Link></nav>}
      <div className="flex items-center gap-2">{connected && <><Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Notificações"><Bell className="h-4 w-4" /></Button><span className="hidden max-w-32 truncate text-sm text-muted-foreground md:inline">Olá, {user?.name.split(" ")[0]}</span><Button variant="ghost" size="sm" onClick={async () => { await logout(); setLocation("/login"); }}><LogOut className="mr-2 h-4 w-4" />Sair</Button></>}{!connected && !loading && <Link href="/login"><a><Button size="sm">Entrar</Button></a></Link>}<Button variant="ghost" size="icon" className="xl:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button></div>
    </div>
    {connected && <div className="border-t border-border/60 bg-slate-50/80"><div className="container flex items-center gap-2 overflow-x-auto py-2"><Badge variant="secondary" className="mr-2 shrink-0 bg-blue-50 text-blue-700">Área conectada</Badge>{[{ href: "/painel", label: "Painel", icon: LayoutDashboard }, { href: "/comunidades", label: "Comunidades", icon: Users }, { href: "/mensagens", label: "Mensagens", icon: MessageCircle }, { href: "/perfil", label: "Meu perfil", icon: BriefcaseBusiness }].map(({ href, label, icon: Icon }) => <Link key={href} href={href}><a className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm ${location === href ? "bg-white font-semibold text-primary shadow-sm" : "text-muted-foreground hover:bg-white"}`}><Icon className="h-4 w-4" />{label}</a></Link>)}<ChevronDown className="ml-auto hidden h-4 w-4 text-muted-foreground sm:block" /></div></div>}
  </header>;
}
