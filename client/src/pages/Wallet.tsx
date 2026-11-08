import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, CircleDollarSign, Plus, WalletCards } from "lucide-react";
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
  const [entries, setEntries] = useState<Row[]>([]);
  const [completedBookings, setCompletedBookings] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ income: 0, expenses: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expense, setExpense] = useState({ description: "", amount: "", paymentMethod: "" });
  const [receiptMethods, setReceiptMethods] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const result = await api.wallet();
    setEntries(result.entries);
    setCompletedBookings(result.completedBookings);
    setTotals(result.totals);
  }, []);
  useEffect(() => { void load().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Carteira.")).finally(() => setLoading(false)); }, [load]);

  async function registerReceipt(booking: Row) {
    setBusyId(Number(booking.booking_id));
    try {
      await api.createWalletEntry({ entryType: "receita", bookingId: Number(booking.booking_id), paymentMethod: receiptMethods[Number(booking.booking_id)] || "informado pelo profissional" });
      await load();
      toast.success("Recebimento registrado na sua Carteira.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar o recebimento."); }
    finally { setBusyId(null); }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(expense.amount);
    if (!expense.description.trim() || !Number.isFinite(amount) || amount <= 0) { toast.error("Informe a descrição e um valor válido."); return; }
    setBusyId(-1);
    try {
      await api.createWalletEntry({ entryType: "despesa", description: expense.description.trim(), amount, paymentMethod: expense.paymentMethod.trim() || undefined });
      setExpense({ description: "", amount: "", paymentMethod: "" });
      await load();
      toast.success("Despesa registrada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a despesa."); }
    finally { setBusyId(null); }
  }

  const professional = user?.role === "profissional";
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container py-8 md:py-10">
    <div className="mb-7"><Badge className="mb-3 gap-1 bg-blue-100 text-blue-700"><WalletCards className="h-3.5 w-3.5" />Área financeira</Badge><h1 className="text-3xl font-bold tracking-tight">Carteira</h1><p className="mt-2 max-w-2xl text-muted-foreground">Controle particular dos valores recebidos e das despesas dos seus serviços.</p></div>
    {!professional ? <Card className="border-dashed border-blue-200 bg-white/85"><CardContent className="p-8 text-center"><p className="font-semibold">A Carteira está disponível para profissionais.</p><p className="mt-1 text-sm text-muted-foreground">Ela mostra somente os registros financeiros da própria conta profissional.</p></CardContent></Card> : <>
      <Card className="mb-5 border-blue-100 bg-blue-50/70"><CardContent className="flex items-start gap-3 p-4"><CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-6 text-slate-700">O ManiService não processa pagamentos, não retém dinheiro e não cobra comissão. A Carteira é um controle manual: o recebimento só é lançado quando o cliente informar que pagou ou quando você registrar que recebeu diretamente. Se ainda não recebeu, deixe sem registrar.</p></CardContent></Card>
      <div className="grid gap-4 sm:grid-cols-3"><Summary label="Recebimentos anotados" value={loading ? "…" : money(totals.income)} icon={ArrowDownToLine} /><Summary label="Despesas anotadas" value={loading ? "…" : money(totals.expenses)} icon={CircleDollarSign} /><Summary label="Saldo registrado" value={loading ? "…" : money(totals.balance)} icon={WalletCards} /></div>

      {completedBookings.length > 0 && <section className="mt-8"><h2 className="mb-1 text-xl font-bold">Serviços concluídos sem recebimento registrado</h2><p className="mb-4 text-sm text-muted-foreground">Quando o pagamento direto acontecer, registre o valor final combinado. O botão apenas anota a informação que você declarou.</p><div className="grid gap-3 lg:grid-cols-2">{completedBookings.map((booking) => { const bookingId = Number(booking.booking_id); return <Card key={bookingId}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{booking.title || "Serviço concluído"}</p><p className="text-sm text-muted-foreground">Cliente: {booking.customer_name}</p><p className="mt-1 text-lg font-bold text-primary">{money(Number(booking.final_amount ?? booking.agreed_amount ?? 0))}</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Forma de recebimento" className="h-9 rounded-md border bg-white px-2 text-sm" value={receiptMethods[bookingId] || ""} onChange={(event) => setReceiptMethods((current) => ({ ...current, [bookingId]: event.target.value }))}><option value="">Forma (opcional)</option><option>Pix</option><option>Dinheiro</option><option>Transferência</option><option>Cartão</option><option>Outra</option></select><Button size="sm" disabled={busyId === bookingId} onClick={() => void registerReceipt(booking)}>{busyId === bookingId ? "Salvando..." : "Registrar que recebi"}</Button></div></CardContent></Card>; })}</div></section>}

      <section className="mt-8"><h2 className="mb-4 text-xl font-bold">Registrar uma despesa</h2><Card><CardContent className="p-5"><form onSubmit={(event) => void addExpense(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"><label className="space-y-1 text-sm font-medium">Descrição<Input maxLength={240} value={expense.description} onChange={(event) => setExpense((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: materiais do serviço" /></label><label className="space-y-1 text-sm font-medium">Valor (R$)<Input type="number" min="0.01" step="0.01" value={expense.amount} onChange={(event) => setExpense((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" /></label><label className="space-y-1 text-sm font-medium">Forma (opcional)<Input maxLength={40} value={expense.paymentMethod} onChange={(event) => setExpense((current) => ({ ...current, paymentMethod: event.target.value }))} placeholder="Dinheiro, Pix..." /></label><Button className="self-end" disabled={busyId === -1}><Plus className="mr-2 h-4 w-4" />Adicionar despesa</Button></form></CardContent></Card></section>

      <section className="mt-8"><h2 className="mb-4 text-xl font-bold">Movimentações</h2>{loading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando movimentações...</CardContent></Card> : entries.length ? <div className="grid gap-3 lg:grid-cols-2">{entries.map((entry) => <Card key={entry.id}><CardContent className="flex flex-wrap items-start justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{entry.description}</p><Badge variant={entry.entry_type === "receita" ? "default" : "secondary"}>{entry.entry_type === "receita" ? "Recebimento" : "Despesa"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{dateLabel(entry.occurred_at)}{entry.payment_method ? ` · ${entry.payment_method}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{entry.report_source === "cliente_confirmou" ? "Informado pelo cliente" : entry.report_source === "profissional_confirmou" ? "Informado por você" : "Lançamento manual"}</p></div><p className={`text-lg font-bold ${entry.entry_type === "receita" ? "text-emerald-700" : "text-slate-700"}`}>{entry.entry_type === "receita" ? "+" : "−"}{money(Number(entry.amount))}</p></CardContent></Card>)}</div> : <Card className="border-dashed border-blue-200 bg-white/85"><CardContent className="p-8 text-center"><p className="font-semibold">Nenhuma movimentação registrada</p><p className="mt-1 text-sm text-muted-foreground">Depois de concluir um serviço, os valores informados aparecerão aqui.</p></CardContent></Card>}</section>
    </>}
  </main></div>;
}

function Summary({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CircleDollarSign }) { return <Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>; }
