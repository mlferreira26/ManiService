import { FormEvent, useEffect, useState } from "react";
import { ArrowDownToLine, CircleDollarSign, Clock3, WalletCards } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Row = Record<string, any>;
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function Wallet() {
  const { user } = useAuth();
  const [rate, setRate] = useState(8);
  const [transactions, setTransactions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRate, setSavingRate] = useState(false);
  useEffect(() => { api.wallet().then((result) => { setRate(result.commissionRatePercent); setTransactions(result.transactions); }).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Carteira.")).finally(() => setLoading(false)); }, []);
  const paid = transactions.filter((item) => item.status === "pago");
  const paidTotal = paid.reduce((sum, item) => sum + Number(user?.role === "profissional" ? item.professional_net || 0 : item.gross_amount || 0), 0);
  const platformTotal = paid.reduce((sum, item) => sum + Number(item.platform_fee || 0), 0);
  async function saveRate(event: FormEvent) {
    event.preventDefault();
    setSavingRate(true);
    try { const result = await api.saveCommissionRate(rate); setRate(result.commissionRatePercent); toast.success("Taxa da plataforma atualizada."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a taxa."); }
    finally { setSavingRate(false); }
  }
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container py-8 md:py-10">
    <div className="mb-7"><Badge className="mb-3 gap-1 bg-blue-100 text-blue-700"><WalletCards className="h-3.5 w-3.5" />Área financeira</Badge><h1 className="text-3xl font-bold tracking-tight">Carteira</h1><p className="mt-2 max-w-2xl text-muted-foreground">Extrato de pagamentos do Mercado Pago e dos serviços feitos pela sua conta.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Summary label={user?.role === "profissional" ? "Serviços pagos" : "Pagamentos confirmados"} value={loading ? "…" : money(paidTotal)} icon={CircleDollarSign} />{user?.role === "admin" && <Summary label="Comissão ManiService recebida" value={loading ? "…" : money(platformTotal)} icon={ArrowDownToLine} />}<Summary label="Taxa da plataforma" value={`${rate}%`} icon={WalletCards} /></div>
    {user?.role === "admin" && <Card className="mt-5"><CardContent className="p-5"><form onSubmit={saveRate} className="flex flex-wrap items-end gap-3"><label className="flex-1 space-y-2 text-sm font-medium" htmlFor="commission-rate">Comissão ManiService (%)<Input id="commission-rate" type="number" min="0" max="100" step="0.1" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label><Button disabled={savingRate}>{savingRate ? "Salvando..." : "Salvar taxa"}</Button></form><p className="mt-2 text-xs text-muted-foreground">A nova taxa vale para pagamentos futuros; transações passadas mantêm os valores registrados.</p></CardContent></Card>}
    <Card className="mt-6 border-blue-100 bg-white/90"><CardContent className="flex items-start gap-3 p-5"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Pagamento após a conclusão</p><p className="mt-1 text-sm leading-6 text-muted-foreground">A Carteira registra pagamentos confirmados pelo provedor; não mantém saldo nem segura o dinheiro. A integração do Mercado Pago ainda precisa estar habilitada para cobrar o cliente, calcular a taxa efetiva e registrar repasses.</p><p className="mt-2 text-xs text-muted-foreground">{user?.role === "profissional" ? "O valor líquido e a taxa de processamento serão exibidos após a confirmação da transação pelo Mercado Pago." : "A taxa de processamento do Mercado Pago será mostrada quando o provedor devolver o valor confirmado."}</p></div></CardContent></Card>
    <section className="mt-8"><h2 className="mb-4 text-xl font-bold">Histórico de pagamentos</h2>{loading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando histórico...</CardContent></Card> : transactions.length ? <div className="grid gap-4 lg:grid-cols-2">{transactions.map((item) => <Card key={item.id}><CardContent className="flex flex-wrap items-start justify-between gap-4 p-5"><div><p className="font-semibold">{item.title || "Serviço ManiService"}</p><p className="mt-1 text-sm text-muted-foreground">{dateLabel(item.created_at)}</p>{user?.role === "profissional" ? <p className="mt-3 text-sm">Repasse: {item.professional_net == null ? "Aguardando confirmação do provedor" : money(Number(item.professional_net))}</p> : <p className="mt-3 text-sm">Total pago: {money(Number(item.gross_amount || 0))}</p>}{user?.role === "admin" && <p className="text-xs text-muted-foreground">Comissão ({Number(item.commission_rate)}%): {money(Number(item.platform_fee || 0))}{item.processing_fee != null ? ` · Taxa do Mercado Pago: ${money(Number(item.processing_fee))}` : " · Taxa do provedor pendente"}</p>}</div><Badge variant={item.status === "pago" ? "default" : "secondary"}>{item.status.replaceAll("_", " ")}</Badge></CardContent></Card>)}</div> : <Card className="border-dashed border-blue-200 bg-white/85"><CardContent className="p-8 text-center"><p className="font-semibold">Nenhum pagamento registrado</p><p className="mt-1 text-sm text-muted-foreground">Quando o Mercado Pago estiver integrado e confirmar uma cobrança, ela aparecerá aqui.</p></CardContent></Card>}</section>
  </main></div>;
}

function Summary({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CircleDollarSign }) { return <Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }
