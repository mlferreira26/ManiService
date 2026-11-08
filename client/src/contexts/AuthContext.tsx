import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export type AuthUser = { id: number; name: string; email: string; role: string; isModerationBlocked?: boolean; moderationBlockedUntil?: string | null; moderationBlockReason?: string | null };
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  register: (payload: { name: string; email: string; password: string; role: "usuario" | "profissional"; specialty?: string }) => Promise<AuthUser>;
  login: (payload: { email: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const authRevision = useRef(0);
  const refresh = async () => {
    const revision = authRevision.current;
    try { const result = await api.me(); if (revision === authRevision.current) setUser(result.user); }
    catch { if (revision === authRevision.current) setUser(null); }
    finally { if (revision === authRevision.current) setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const register = async (payload: Parameters<AuthContextValue["register"]>[0]) => { const revision = ++authRevision.current; const result = await api.register(payload); if (revision === authRevision.current) setUser(result.user); return result.user; };
  const login = async (payload: Parameters<AuthContextValue["login"]>[0]) => { const revision = ++authRevision.current; const result = await api.login(payload); if (revision === authRevision.current) setUser(result.user); return result.user; };
  const logout = async () => {
    const revision = ++authRevision.current;
    if (revision === authRevision.current) setUser(null);
    try { await api.logout(); } catch { /* A troca de conta continua disponível mesmo se a sessão já expirou. */ }
  };
  return <AuthContext.Provider value={{ user, loading, register, login, logout, refresh }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth precisa estar dentro de AuthProvider"); return value; }
