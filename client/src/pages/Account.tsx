import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, LockKeyhole, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";

type Role = "usuario" | "profissional";
const roles = [
  { id: "usuario" as Role, title: "Sou consumidor", desc: "Encontre ajuda, publique pedidos e acompanhe seus serviços.", icon: UserRound, color: "bg-blue-50 text-blue-700" },
  { id: "profissional" as Role, title: "Sou profissional", desc: "Mostre seu trabalho, receba oportunidades e envie orçamentos.", icon: Wrench, color: "bg-amber-50 text-amber-700" },
];

export default function Account() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [role, setRole] = useState<Role>(() => new URLSearchParams(window.location.search).get("perfil") === "profissional" ? "profissional" : "usuario");
  const [created, setCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", specialty: "" });
  const current = roles.find((item) => item.id === role)!;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({ ...form, role });
      setCreated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100">
      <SiteHeader />
      <main className="container py-10 md:py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <Badge className="mb-4 bg-blue-100 text-blue-700 hover:bg-blue-100">Sua conta, do seu jeito</Badge>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Crie seu acesso à Mani Service</h1>
            <p className="mt-4 text-lg text-muted-foreground">Escolha como você participa da comunidade. Você poderá atualizar seus dados e completar o perfil depois.</p>
            <p className="mt-3 text-sm text-muted-foreground">Quer conhecer as etapas antes? <Link href="/como-funciona"><a className="font-semibold text-primary hover:underline">Veja como funciona</a></Link>.</p>
          </div>

          {created ? (
            <Card className="border-primary/20 bg-white shadow-lg">
              <CardContent className="flex flex-col items-start gap-6 p-8 md:p-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700"><Check className="h-7 w-7" /></div>
                <div>
                  <h2 className="text-2xl font-bold">Conta criada como {current.title.toLowerCase()}</h2>
                  <p className="mt-2 text-muted-foreground">Seu cadastro foi salvo no banco de dados. Escolha para onde deseja continuar:</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setLocation("/painel")}>Ir para meu painel <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  <Link href="/comunidades"><a><Button variant="outline">Explorar comunidades</Button></a></Link>
                  <Link href="/perfil"><a><Button variant="outline">Ver meu perfil</Button></a></Link>
                  <Button variant="ghost" onClick={() => setCreated(false)}>Criar outra conta</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                {roles.map(({ id, title, desc, icon: Icon, color }) => (
                  <button key={id} onClick={() => setRole(id)} className={`flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all ${role === id ? "border-primary bg-white shadow-md ring-2 ring-primary/10" : "border-border bg-white/70 hover:border-primary/30"}`}>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div>
                    <span className="flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{desc}</span></span>
                    {role === id && <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                  </button>
                ))}
                <div className="flex items-center gap-2 px-1 pt-4 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4 text-primary" /> Suas senhas são protegidas antes de serem armazenadas.</div>
              </div>
              <Card className="border-0 shadow-lg">
                <CardHeader><CardTitle>Dados da conta</CardTitle><p className="text-sm text-muted-foreground">Cadastro de {current.title.toLowerCase()}</p></CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={submit}>
                    <div className="space-y-2"><Label htmlFor="name">Nome completo</Label><Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Marina Oliveira" /></div>
                    <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" /></div>
                    <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo de 8 caracteres" /></div>
                    {role === "profissional" && <div className="space-y-2"><Label htmlFor="service">Especialidade principal</Label><Input id="service" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Ex.: elétrica residencial" /></div>}
                    {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                    <Button disabled={loading} className="mt-2 w-full" type="submit">{loading ? "Salvando..." : "Criar conta"} <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    <p className="text-center text-xs text-muted-foreground">Ao continuar, você concorda com os termos e a política de privacidade.</p>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
          <p className="mt-8 text-center text-sm text-muted-foreground">Já possui cadastro? <Link href="/login"><a className="font-semibold text-primary hover:underline">Acessar minha conta</a></Link></p>
        </div>
      </main>
    </div>
  );
}
