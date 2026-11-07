import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Search, Send } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Conversation = { id: number; other_user_id: number; other_user_name: string; other_user_role: string; other_user_avatar_url?: string | null; last_message?: string; last_message_at?: string };
type Message = { id: number; sender_id: number; sender_name: string; body: string; created_at: string; read_at?: string | null };
const time = (value?: string) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

export default function Messages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("conversation")) || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const loadConversations = useCallback(async () => {
    try { const data = await api.conversations(); setConversations(data.conversations as Conversation[]); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar as conversas."); }
    finally { setLoading(false); }
  }, []);
  const loadMessages = useCallback(async (id: number) => {
    try { const data = await api.messages(id); setMessages(data.messages as Message[]); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar as mensagens."); }
  }, []);
  useEffect(() => { void loadConversations(); const timer = window.setInterval(() => void loadConversations(), 10000); return () => window.clearInterval(timer); }, [loadConversations]);
  useEffect(() => { if (!activeId) { setMessages([]); return; } void loadMessages(activeId); const timer = window.setInterval(() => void loadMessages(activeId), 4000); return () => window.clearInterval(timer); }, [activeId, loadMessages]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const active = conversations.find((item) => Number(item.id) === Number(activeId));
  function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    try { await api.sendMessage(activeId, draft.trim()); setDraft(""); await Promise.all([loadMessages(activeId), loadConversations()]); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar a mensagem."); }
    finally { setSending(false); }
  }
  return <div className="min-h-screen bg-slate-50"><SiteHeader /><main className="container py-8"><h1 className="mb-2 text-3xl font-bold">Mensagens</h1><p className="mb-6 text-muted-foreground">Converse diretamente sobre serviços e orçamentos.</p><Card className="grid min-h-[65vh] overflow-hidden md:grid-cols-[300px_1fr]">
    <aside className="border-b md:border-b-0 md:border-r"><div className="border-b p-4 font-semibold">Conversas</div>{loading ? <p className="p-5 text-sm text-muted-foreground">Carregando...</p> : conversations.length === 0 ? <div className="flex flex-col items-center gap-3 p-6 text-center"><p className="text-sm text-muted-foreground">Você ainda não tem conversas.</p><Link href={user?.role === "profissional" ? "/comunidades" : "/profissionais"}><a><Button size="sm"><Search className="mr-2 h-4 w-4" />{user?.role === "profissional" ? "Ver pedidos e iniciar chat" : "Buscar profissionais e iniciar chat"}</Button></a></Link></div> : <div className="max-h-[65vh] overflow-y-auto">{conversations.map((conversation) => <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full items-center gap-3 border-b p-4 text-left hover:bg-slate-50 ${activeId === conversation.id ? "bg-blue-50" : ""}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-bold text-blue-800">{conversation.other_user_avatar_url ? <img src={conversation.other_user_avatar_url} alt="" className="h-full w-full object-cover" /> : initials(conversation.other_user_name)}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{conversation.other_user_name}</span><span className="mt-1 block truncate text-sm text-muted-foreground">{conversation.last_message || "Inicie a conversa"}</span><span className="mt-1 block text-xs text-muted-foreground">{time(conversation.last_message_at)}</span></span></button>)}</div>}</aside>
    <section className="flex min-h-[55vh] flex-col">{!active ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"><MessageCircle className="mb-3 h-10 w-10" /><p>Selecione uma conversa para ver as mensagens.</p></div> : <><header className="flex items-center gap-3 border-b p-4"><Link href={`/perfil/${active.other_user_id}`}><a aria-label={`Ver perfil de ${active.other_user_name}`} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-bold text-blue-800 ring-2 ring-blue-50">{active.other_user_avatar_url ? <img src={active.other_user_avatar_url} alt={`Foto de ${active.other_user_name}`} className="h-full w-full object-cover" /> : initials(active.other_user_name)}</a></Link><div className="min-w-0"><Link href={`/perfil/${active.other_user_id}`}><a className="font-semibold hover:text-blue-700 hover:underline">{active.other_user_name}</a></Link><p className="text-xs capitalize text-muted-foreground">{active.other_user_role === "profissional" ? "Profissional" : "Consumidor"} · <Link href={`/perfil/${active.other_user_id}`}><a className="text-blue-700 hover:underline">Ver perfil</a></Link></p></div></header><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Envie a primeira mensagem para começar.</p>}{messages.map((message) => { const mine = Number(message.sender_id) === Number(user?.id); return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${mine ? "bg-primary text-primary-foreground" : "bg-slate-100"}`}><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p><p className={`mt-1 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{time(message.created_at)}</p></div></div>; })}<div ref={bottom} /></div><form onSubmit={submit} className="flex gap-2 border-t p-3"><Input value={draft} maxLength={5000} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva sua mensagem..." aria-label="Mensagem" /><Button type="submit" disabled={sending || !draft.trim()} size="icon" aria-label="Enviar mensagem"><Send className="h-4 w-4" /></Button></form></>}</section>
  </Card></main></div>;
}
