import { useState } from "react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function ConfirmEmail() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const validLink = /^[a-f0-9]{64}$/.test(token);

  async function confirm() {
    if (loading || !validLink) return;
    setLoading(true);
    setError("");
    try {
      await api.confirmEmail(token);
      window.location.replace("/servicos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o cadastro.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100">
      <SiteHeader />
      <main className="container py-12">
        <Card className="mx-auto max-w-md">
          <CardContent className="space-y-5 p-6">
            <h1 className="text-2xl font-bold">Confirme seu e-mail</h1>
            {validLink ? (
              <>
                <p className="text-sm text-muted-foreground">Se foi você quem iniciou o cadastro, confirme para ativar a conta e entrar no ManiService.</p>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button disabled={loading} onClick={() => void confirm()}>
                  {loading ? "Confirmando..." : "Confirmar e entrar"}
                </Button>
              </>
            ) : <p role="alert">Link de confirmação inválido.</p>}
            <Link href="/criar-conta" className="block text-sm font-medium text-primary">Voltar ao cadastro e pedir novo link</Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
