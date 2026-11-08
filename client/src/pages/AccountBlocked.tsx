import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, Send, ShieldCheck } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function AccountBlocked() {
  const { user, refresh, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [appeal, setAppeal] = useState<Record<string, any> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const result = await api.accountAppealStatus();
    setAppeal(result.appeal);
    if (!user?.isModerationBlocked) { setLocation("/servicos"); return; }
  }
  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível consultar o recurso."));
    const timer = window.setInterval(() => { void load().catch(() => undefined); void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [user?.isModerationBlocked]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api.submitAccountAppeal(message); setAppeal(result.appeal); setMessage(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível enviar o recurso."); }
    finally { setBusy(false); }
  }
  const pending = appeal && ["aberta", "em_analise"].includes(appeal.status);
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container flex min-h-[calc(100vh-64px)] max-w-2xl items-center justify-center py-8"><Card className="w-full shadow-lg"><CardHeader><Badge className="w-fit gap-2 bg-amber-100 text-amber-900 hover:bg-amber-100"><LockKeyhole className="h-4 w-4" />Acesso restrito</Badge><CardTitle className="pt-2 text-2xl">Sua conta está em análise</CardTitle><p className="text-sm text-muted-foreground">A equipe ManiService restringiu temporariamente o acesso após uma análise de segurança. Você pode explicar o ocorrido abaixo; um administrador revisará o recurso.</p></CardHeader><CardContent className="space-y-5">
    {user?.moderationBlockReason && <div className="rounded-lg bg-slate-50 p-4 text-sm"><strong>Informação da equipe:</strong><p className="mt-1 whitespace-pre-line">{user.moderationBlockReason}</p></div>}
    {appeal && <div className="rounded-lg border bg-white p-4 text-sm"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Recurso {appeal.status === "aberta" ? "enviado" : appeal.status.replaceAll("_", " ")}</div><p className="mt-2 whitespace-pre-line text-muted-foreground">{appeal.message}</p>{appeal.admin_note && <p className="mt-3 border-t pt-3"><strong>Resposta da equipe:</strong> {appeal.admin_note}</p>}</div>}
    {!pending && <form onSubmit={submit} className="space-y-3"><label htmlFor="appeal-message" className="text-sm font-medium">Enviar recurso à equipe</label><Textarea id="appeal-message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={3000} required placeholder="Conte com detalhes por que você acredita que a conta deve ser reavaliada." /><p className="text-xs text-muted-foreground">De 10 a 3.000 caracteres. Enquanto houver recurso em análise, não será possível enviar outro.</p><Button type="submit" disabled={busy}><Send className="mr-2 h-4 w-4" />{busy ? "Enviando..." : "Enviar recurso"}</Button></form>}
    {pending && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Seu recurso está na fila de análise. Esta tela atualizará o status automaticamente.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button type="button" variant="outline" onClick={async () => { await logout(); setLocation("/login"); }}>Sair da conta</Button>
  </CardContent></Card></main></div>;
}
