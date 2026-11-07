import { useState, type FormEvent } from "react";
import { Flag, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const reasons = [
  "Suspeita de golpe ou fraude",
  "Pedido de pagamento fora da plataforma",
  "Perfil ou identidade falsa",
  "Assédio, ameaça ou discriminação",
  "Spam ou anúncio enganoso",
  "Conteúdo impróprio",
  "Outro",
];

export default function ReportButton({ targetType, targetId, compact = false }: { targetType: "profile" | "post" | "request" | "message"; targetId: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const result = await api.createReport({ targetType, targetId, reason, details: details.trim() || undefined });
      toast.success(result.message);
      setOpen(false);
      setDetails("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a denúncia.");
    } finally { setSending(false); }
  }

  return <>
    <Button type="button" variant="ghost" size={compact ? "icon" : "sm"} aria-label="Denunciar" title="Denunciar" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-red-700">
      <Flag className={`h-4 w-4 ${compact ? "" : "mr-2"}`} />{compact ? null : "Denunciar"}
    </Button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" className="my-auto w-full max-w-lg rounded-2xl border bg-white p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800"><ShieldCheck className="h-3.5 w-3.5" /> Canal confidencial</div><h2 id="report-dialog-title" className="text-xl font-bold">Denunciar para análise</h2><p className="mt-1 text-sm text-muted-foreground">Sua identidade não será exibida para a pessoa denunciada. A equipe do ManiService analisará o contexto.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Fechar" disabled={sending} onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button></div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm font-medium">O que aconteceu?
            <select value={reason} onChange={(event) => setReason(event.target.value)} className="flex h-11 w-full rounded-md border border-input bg-white px-3 text-sm font-normal">
              {reasons.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">Detalhes (opcional)
            <Textarea value={details} maxLength={2000} onChange={(event) => setDetails(event.target.value)} placeholder="Conte apenas o que ajude a equipe a entender e revisar o caso." />
            <span className="block text-right text-xs font-normal text-muted-foreground">{details.length}/2000</span>
          </label>
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">Se alguém estiver em perigo imediato, procure os serviços de emergência da sua região.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={sending} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={sending}>{sending ? "Enviando..." : "Enviar denúncia"}</Button></div>
        </form>
      </section>
    </div>}
  </>;
}
