import { FormEvent, useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Comment = { id: number; user_id: number; body: string; created_at: string; author_name: string; author_avatar_url?: string | null };

export default function PostComments({ postId, count = 0, onCountChange }: { postId: number; count?: number; onCountChange?: (count: number) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open || loaded || loading) return;
    setLoading(true);
    api.postComments(postId)
      .then(({ comments: result }) => { setComments(result as Comment[]); setLoaded(true); })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar os comentários."))
      .finally(() => setLoading(false));
  }, [open, loaded, loading, postId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const result = await api.createPostComment(postId, draft.trim());
      const newComment = { ...result.comment, author_name: user?.name || "Você" } as Comment;
      setComments((current) => [...current, newComment]);
      setDraft("");
      setLoaded(true);
      onCountChange?.(result.commentsCount);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível publicar o comentário."); }
    finally { setSending(false); }
  }

  return <div className="mt-3 border-t pt-3">
    <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <MessageCircle className="mr-2 h-4 w-4" />{count} {count === 1 ? "comentário" : "comentários"}
    </Button>
    {open && <div className="mt-3 space-y-3">
      {loading ? <p className="text-sm text-muted-foreground">Carregando comentários...</p> : comments.length ? <div className="max-h-72 space-y-3 overflow-y-auto">{comments.map((comment) => <div key={comment.id} className="flex gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-semibold text-blue-800">{comment.author_avatar_url ? <img src={comment.author_avatar_url} alt="" className="h-full w-full object-cover" /> : comment.author_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
        <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs font-semibold">{comment.author_name}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(comment.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p></div>
      </div>)}</div> : <p className="text-sm text-muted-foreground">Ainda não há comentários. Seja a primeira pessoa a comentar.</p>}
      <form onSubmit={submit} className="flex items-end gap-2"><Textarea value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva um comentário..." aria-label="Escreva um comentário" className="min-h-10 flex-1" /><Button type="submit" size="icon" aria-label="Enviar comentário" disabled={sending || !draft.trim()}><Send className="h-4 w-4" /></Button></form>
    </div>}
  </div>;
}
