import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function ConfirmEmail() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const validLink = /^[a-f0-9]{64}$/.test(token);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !validLink) return;
    setLoading(true);
    setError("");
    try {
      await api.confirmEmail(token, password);
      window.history.replaceState(null, "", "/confirmar-email");
      setPassword("");
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o cadastro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100">
      <SiteHeader />
      <main className="container py-12">
        <Card className="mx-auto max-w-md">
          <CardContent className="space-y-5 p-6">
            <h1 className="text-2xl font-bold">{confirmed ? "E-mail confirmado" : "Confirme seu e-mail"}</h1>
            {confirmed ? (
              <>
                <p role="status">Sua conta está ativa. Entre com o e-mail e a senha do cadastro.</p>
                <Button asChild><Link href="/login">Ir para o login</Link></Button>
              </>
            ) : (
              <>
                {validLink ? (
                  <form className="space-y-4" onSubmit={confirm}>
                    <p className="text-sm text-muted-foreground">Digite a senha que você escolheu no cadastro para ativar sua conta.</p>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Senha do cadastro</Label>
                      <Input id="confirm-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" disabled={loading}>{loading ? "Confirmando..." : "Confirmar e ativar conta"}</Button>
                  </form>
                ) : <p role="alert">Link de confirmação inválido.</p>}
                <Link href="/criar-conta" className="block text-sm font-medium text-primary">Voltar ao cadastro e pedir novo link</Link>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
