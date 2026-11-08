import { Bell, BriefcaseBusiness, CalendarDays, LayoutDashboard, LogOut, Menu, MessageCircle, Newspaper, Search, Settings as SettingsIcon, ShieldCheck, Users, WalletCards } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { playChatNotificationSound } from "@/lib/chat-sound";

export default function SiteHeader() {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<Record<string, any>>>([]);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const lastChatMessageIds = useRef<Record<number, number>>({});
  const { user, loading, logout } = useAuth();
  const appLinks = [
    { href: "/comunidades", label: "Serviços na Região", icon: Users },
    { href: "/mensagens", label: "Mensagens", icon: MessageCircle },
    { href: "/configuracoes", label: "Configurações", icon: SettingsIcon },
    { href: "/servicos", label: "Comunidade", icon: Newspaper },
    { href: "/servicos/acompanhar", label: "Acompanhar serviços", icon: CalendarDays },
    { href: "/carteira", label: "Carteira", icon: WalletCards },
  ];
  const quickLinks = [
    { href: "/perfil", label: "Meu perfil", icon: BriefcaseBusiness },
    { href: "/painel", label: "Painel", icon: LayoutDashboard },
  ];
  const adminLinks = user?.role === "admin" ? [
    { href: "/admin/denuncias", label: "Denúncias", icon: ShieldCheck },
    { href: "/admin/pessoas", label: "Pessoas", icon: Users },
  ] : [];
  const connected = Boolean(user);
  const visibleAppLinks = appLinks.filter((item) => item.href !== "/carteira" || user?.role === "profissional");
  const allLinks = [...quickLinks, ...visibleAppLinks, ...adminLinks];
  const publicProfileId = location.startsWith("/perfil/") ? Number(location.slice("/perfil/".length).split(/[/?#]/)[0]) : null;
  const brandHref = connected && publicProfileId === Number(user?.id) ? "/perfil" : connected ? "/servicos" : "/";

  useEffect(() => {
    if (!connected) { setNotifications([]); return; }
    let active = true;
    const load = () => api.notifications().then(({ notifications: items }) => { if (active) setNotifications(items); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [connected, user?.id]);

  useEffect(() => {
    if (!connected) { setHasUnreadMessages(false); lastChatMessageIds.current = {}; return; }
    lastChatMessageIds.current = {};
    let active = true;
    let hasInitialSnapshot = false;
    const load = () => api.conversations().then(({ conversations }) => {
      if (!active) return;
      const nextIds: Record<number, number> = {};
      let hasIncomingMessage = false;
      conversations.forEach((conversation) => {
        const conversationId = Number(conversation.id);
        const messageId = Number(conversation.last_message_id || 0);
        nextIds[conversationId] = messageId;
        if (hasInitialSnapshot && messageId > 0 && messageId > (lastChatMessageIds.current[conversationId] || 0) && Number(conversation.last_message_sender_id) !== Number(user?.id)) {
          hasIncomingMessage = true;
        }
      });
      lastChatMessageIds.current = nextIds;
      if (hasIncomingMessage) playChatNotificationSound();
      setHasUnreadMessages(conversations.some((conversation) => Number(conversation.unread_count || 0) > 0));
      hasInitialSnapshot = true;
    }).catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    window.addEventListener("messages-read", load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("messages-read", load); };
  }, [connected, user?.id]);

  const unreadCount = notifications.filter((item) => !item.read_at).length;
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    setMenuOpen(false);
    setLocation(`/profissionais${query ? `?search=${encodeURIComponent(query)}` : ""}`);
  }
  async function openNotification(item: Record<string, any>) {
    if (!item.read_at) {
      await api.markNotificationRead(Number(item.id)).catch(() => undefined);
      setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification));
    }
    setNotificationOpen(false);
    if (item.link) setLocation(String(item.link));
  }
  function searchForm(className = "") {
    return <form role="search" onSubmit={submitSearch} className={`flex min-w-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${className}`}>
      <Search aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
      <Input aria-label="Pesquisar perfis por nome, profissão ou serviço" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar nome, profissão ou serviço" className="h-9 min-w-0 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0" />
      <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-lg" aria-label="Pesquisar"><Search className="h-4 w-4" /></Button>
    </form>;
  }

  return <header className="sticky top-0 z-50 border-b border-border/80 bg-white/95 backdrop-blur">
    <div className="container flex min-h-16 items-center justify-between gap-2 sm:gap-4">
      <Link href={brandHref}><a className="flex shrink-0 items-center gap-2 font-bold text-primary"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm tracking-tight text-primary-foreground shadow-sm">MS</span><span className="text-base tracking-tight sm:text-xl">Mani Service</span></a></Link>
      {connected && <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 xl:flex">{searchForm("w-full max-w-md")}<nav className="flex shrink-0 items-center gap-1" aria-label="Atalhos"><Link href="/perfil"><a className={`rounded-lg px-3 py-2 text-sm font-medium ${location === "/perfil" ? "bg-blue-50 text-primary" : "text-slate-600 hover:bg-slate-50 hover:text-primary"}`}>Meu perfil</a></Link><Link href="/painel"><a className={`rounded-lg px-3 py-2 text-sm font-medium ${location === "/painel" ? "bg-blue-50 text-primary" : "text-slate-600 hover:bg-slate-50 hover:text-primary"}`}>Painel</a></Link></nav></div>}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {connected && <>
          <div className="relative"><Button variant="ghost" size="icon" aria-label={`Notificações${unreadCount ? `, ${unreadCount} não lidas` : ""}`} aria-expanded={notificationOpen} onClick={() => setNotificationOpen((open) => !open)}><Bell className="h-4 w-4" />{unreadCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}</Button>{notificationOpen && <div className="fixed left-2 right-2 top-20 z-[70] max-h-[calc(100dvh-6rem)] w-auto overflow-hidden rounded-xl border bg-white p-2 text-left shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:max-h-[calc(100dvh-5rem)] sm:w-[min(22rem,calc(100vw-2rem))]"><div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-2 pb-2"><p className="font-semibold">Notificações</p>{unreadCount > 0 && <button className="text-xs text-primary hover:underline" onClick={() => { void api.markAllNotificationsRead().then(() => setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))); }}>Marcar todas como lidas</button>}</div><div className="max-h-[min(20rem,calc(100dvh-9rem))] overflow-y-auto">{notifications.length ? notifications.map((item) => <button key={item.id} onClick={() => void openNotification(item)} className={`block w-full min-w-0 rounded-lg p-3 text-left hover:bg-slate-50 ${item.read_at ? "" : "bg-blue-50/70"}`}><span className="block break-words text-sm font-semibold">{item.title}</span><span className="mt-1 block break-words text-xs text-muted-foreground">{item.body}</span><span className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</span></button>) : <p className="p-5 text-center text-sm text-muted-foreground">Você ainda não tem notificações.</p>}</div></div>}</div>
          <span className="hidden max-w-32 truncate text-sm text-muted-foreground md:inline">Olá, {user?.name.split(" ")[0]}</span>
          <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={async () => { await logout(); setLocation("/login"); }}><LogOut className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Sair</span></Button>
        </>}
        {!connected && !loading && <Link href="/login"><a><Button size="sm">Entrar</Button></a></Link>}
        {connected && <Button variant="ghost" size="icon" className="xl:hidden" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu className="h-5 w-5" /></Button>}
      </div>
    </div>
    {connected && <div className="hidden border-t border-border/60 bg-gradient-to-r from-slate-50 via-blue-50/70 to-slate-50 xl:block"><div className="container flex flex-wrap items-center gap-x-1 gap-y-1 py-2"><Badge variant="secondary" className="mr-1 shrink-0 bg-blue-50 text-blue-700">Área conectada</Badge>{[...visibleAppLinks, ...adminLinks].map(({ href, label, icon: Icon }) => <Link key={href} href={href}><a aria-label={href === "/mensagens" && hasUnreadMessages ? "Mensagens, há mensagens novas" : label} className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs 2xl:text-sm ${location === href ? "bg-white font-semibold text-primary shadow-sm" : "text-muted-foreground hover:bg-white/80"}`}><span className="relative"><Icon className="h-4 w-4" />{href === "/mensagens" && hasUnreadMessages && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}</span>{label}</a></Link>)}</div></div>}
    {connected && menuOpen && <nav className="border-t border-border/60 bg-white p-3 shadow-lg xl:hidden" aria-label="Navegação principal"><div className="container grid gap-1">{searchForm("mb-2 w-full")}{allLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><a onClick={() => setMenuOpen(false)} aria-label={href === "/mensagens" && hasUnreadMessages ? "Mensagens, há mensagens novas" : label} className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${location === href ? "bg-blue-50 font-semibold text-primary" : "text-muted-foreground hover:bg-slate-50"}`}><span className="relative"><Icon className="h-4 w-4" />{href === "/mensagens" && hasUnreadMessages && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}</span>{label}</a></Link>)}</div></nav>}
  </header>;
}
