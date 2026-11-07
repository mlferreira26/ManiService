import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import SiteHeader from "@/components/SiteHeader";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, login, logout } = useAuth();
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("resetToken") || "");
  const [mode, setMode] = useState<"login" | "forgot" | "reset">(() => { const params = new URLSearchParams(window.location.search); return params.has("resetToken") ? "reset" : params.get("mode") === "forgot" ? "forgot" : "login"; });
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    try {
      if (mode === "forgot") {
        await api.forgotPassword(email);
        setMessage("Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.");
      } else if (mode === "reset") {
        if (password !== form.confirmPassword) throw new Error("As senhas não conferem.");
        await api.resetPassword(resetToken, password);
        setResetToken("");
        window.history.replaceState({}, "", "/login");
        setMode("login");
        setForm({ email, password: "", confirmPassword: "" });
        setMessage("Senha alterada. Entre com sua nova senha.");
      } else {
        if (user) await logout();
        await login({ email, password });
        setLocation("/painel");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível concluir."); }
    finally { setLoading(false); }
  }
  const title = mode === "login" ? "Acessar minha conta" : mode === "forgot" ? "Recuperar senha" : "Criar nova senha";
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container flex min-h-[calc(100vh-64px)] items-center justify-center py-10"><Card className="w-full max-w-md shadow-lg"><CardHeader className="space-y-3"><Badge className="w-fit gap-2 bg-blue-100 text-blue-700 hover:bg-blue-100"><LockKeyhole className="h-3.5 w-3.5" />Acesso seguro</Badge><CardTitle className="text-3xl">{title}</CardTitle><p className="text-sm text-muted-foreground">{mode === "login" ? "Entre para acompanhar pedidos, propostas e seu perfil." : mode === "forgot" ? "Informe seu e-mail para receber as instruções de recuperação." : "Escolha uma senha nova com pelo menos 8 caracteres."}</p>{user && mode === "login" && <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">Sessão atual: {user.name}. Entre com outra conta para alternar de usuário, ou <button className="font-semibold underline" onClick={async () => { await logout(); setError(""); }}>saia desta conta</button>.</div>}</CardHeader><CardContent><form className="space-y-4" onSubmit={submit}>
    {mode !== "reset" && <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" autoComplete="email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" />{mode === "forgot" && <p className="text-xs text-muted-foreground">Verifique também a caixa de spam depois do envio.</p>}</div>}
    {mode !== "forgot" && <div className="space-y-2"><Label htmlFor="password">{mode === "reset" ? "Nova senha" : "Senha"}</Label><Input id="password" name="password" autoComplete={mode === "reset" ? "new-password" : "current-password"} required minLength={mode === "reset" ? 8 : undefined} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === "reset" ? "Pelo menos 8 caracteres" : "Sua senha"} /></div>}
    {mode === "reset" && <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar nova senha</Label><Input id="confirmPassword" name="confirmPassword" autoComplete="new-password" required minLength={8} type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Digite a senha novamente" /></div>}
    {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <Button disabled={loading || (mode === "reset" && !resetToken)} className="w-full" type="submit">{loading ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "forgot" ? "Enviar instruções" : "Salvar nova senha"}{mode === "login" ? <ArrowRight className="ml-2 h-4 w-4" /> : <KeyRound className="ml-2 h-4 w-4" />}</Button>
  </form><div className="mt-5 flex flex-col items-center gap-2 text-sm"><button className="font-semibold text-primary hover:underline" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(""); setMessage(""); setResetToken(""); if (mode === "reset") window.history.replaceState({}, "", "/login"); }}>{mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}</button><span className="text-muted-foreground">Ainda não tem conta? <Link href="/criar-conta"><a className="font-semibold text-primary hover:underline">Criar cadastro</a></Link></span></div></CardContent></Card></main></div>;
}
