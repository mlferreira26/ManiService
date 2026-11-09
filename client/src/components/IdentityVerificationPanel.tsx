import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VerificationRequest = Record<string, any>;

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const digitAt = (length: number) => {
    const sum = digits.slice(0, length).split("").reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digitAt(9) === Number(digits[9]) && digitAt(10) === Number(digits[10]);
}

export default function IdentityVerificationPanel() {
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.identityVerification()
      .then((result) => setRequest(result.request))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível consultar a verificação."))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.submitIdentityVerification(cpf, birthDate);
      setRequest(result.request);
      setCpf(""); setBirthDate("");
      toast.success("Dados enviados. Sua verificação está em análise.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar os dados."); }
    finally { setSubmitting(false); }
  }

  const verified = request?.status === "verificada";
  const pending = request?.status === "pendente";

  return <Card className="mt-5">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Verificação do perfil {verified && <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><BadgeCheck className="mr-1 h-3 w-3" />Identidade verificada</Badge>}</CardTitle></CardHeader>
    <CardContent>
      {loading ? <p className="text-sm text-muted-foreground">Consultando status...</p> : verified ? <div className="space-y-2 text-sm"><p>Os dados enviados foram conferidos pela equipe e o selo de identidade verificada está ativo no seu perfil público.</p>{request?.reviewed_at && <p className="text-xs text-muted-foreground">Revisado em {new Date(request.reviewed_at).toLocaleDateString("pt-BR")}.</p>}</div> : <>
        {pending ? <div className="space-y-3"><Badge variant="secondary" className="bg-amber-100 text-amber-900"><Clock3 className="mr-1 h-3 w-3" />Verificação em análise</Badge><p className="text-sm text-muted-foreground">A equipe está conferindo os dados. O selo só aparece publicamente depois da aprovação.</p></div> : <>
          {request?.status === "ajuste_solicitado" && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-medium">A equipe pediu uma correção.</p><p className="mt-1">{request.admin_note}</p></div>}
          <p className="mb-4 text-sm text-muted-foreground">Informe seu CPF e sua data de nascimento para a equipe revisar. Esses dados não aparecem no perfil público.</p>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <div className="space-y-2"><Label htmlFor="verification-cpf">CPF</Label><Input id="verification-cpf" inputMode="numeric" autoComplete="off" maxLength={14} required value={cpf} aria-invalid={Boolean(cpf) && !isValidCpf(cpf)} onChange={(event) => setCpf(formatCpf(event.target.value))} placeholder="000.000.000-00" />{cpf && !isValidCpf(cpf) && <p className="text-xs text-destructive">Digite um CPF válido no formato 000.000.000-00.</p>}</div>
            <div className="space-y-2"><Label htmlFor="verification-birth-date">Data de nascimento</Label><Input id="verification-birth-date" type="date" required value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setBirthDate(event.target.value)} /></div>
            <div className="sm:col-span-2"><Button type="submit" disabled={submitting || !isValidCpf(cpf) || !birthDate}>{submitting ? "Enviando..." : request?.status === "ajuste_solicitado" ? "Enviar correção para análise" : "Solicitar verificação"}</Button></div>
          </form>
        </>}
        <p className="mt-4 flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />CPF e nascimento são armazenados criptografados no banco e não aparecem nas telas do aplicativo. O selo é liberado somente após aprovação da administração.</p>
      </>}
    </CardContent>
  </Card>;
}
