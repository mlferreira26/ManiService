import { FormEvent, useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, KeyRound, MapPin, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type Settings = { name: string; email: string; role: string; is_public: boolean; search_radius_km: number; latitude: number | null; longitude: number | null; notify_messages: boolean; notify_local_requests: boolean };

export default function AccountSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    api.accountSettings().then(({ settings: value }) => setSettings(value as Settings))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar as configurações."))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { toast.error("Este navegador não oferece localização."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        set("latitude", position.coords.latitude);
        set("longitude", position.coords.longitude);
        toast.success("Localização adicionada. Salve as configurações para aplicar.");
      },
      () => toast.error("Não foi possível obter sua localização. Confira a permissão do navegador."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings) return;
    setSaving(true);
    try {
      await api.saveAccountSettings({ isPublic: settings.is_public, searchRadiusKm: Number(settings.search_radius_km), latitude: settings.latitude, longitude: settings.longitude, notifyMessages: settings.notify_messages, notifyLocalRequests: settings.notify_local_requests });
      toast.success("Configurações salvas.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações."); }
    finally { setSaving(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("As senhas novas não coincidem."); return; }
    setChangingPassword(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast.success(result.message);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar a senha."); }
    finally { setChangingPassword(false); }
  }

  return <div className="min-h-screen bg-slate-50"><SiteHeader /><main className="container max-w-3xl space-y-6 py-8 md:py-12">
    <div><p className="text-sm font-semibold text-blue-700">Minha conta</p><h1 className="mt-1 text-3xl font-bold">Configurações</h1><p className="mt-2 text-muted-foreground">Controle sua privacidade, região, notificações e senha.</p></div>
    {loading || !settings ? <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando configurações...</CardContent></Card> : <>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" />Conta</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Nome</p><p className="font-medium">{settings.name}</p></div><div><p className="text-xs text-muted-foreground">E-mail</p><p className="break-all font-medium">{settings.email}</p></div></div><Link href="/perfil"><a><Button variant="outline">Editar dados do perfil</Button></a></Link></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Privacidade e região</CardTitle></CardHeader><CardContent><form onSubmit={save} className="space-y-5">
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-700" checked={settings.is_public} onChange={(event) => set("is_public", event.target.checked)} /><span><span className="font-medium">Perfil público e pesquisável</span><span className="mt-1 block text-sm text-muted-foreground">Quando desativado, outras pessoas não encontram nem abrem seu perfil.</span></span></label>
        <div className="space-y-2"><Label htmlFor="search-radius">Distância para busca e alertas (km)</Label><Input id="search-radius" type="number" min="1" max="300" required value={settings.search_radius_km} onChange={(event) => set("search_radius_km", Number(event.target.value))} /><p className="text-xs text-muted-foreground">Com localização, o ManiService mostra perfis e pedidos dentro deste raio. Sem localização, usa a cidade e o estado do perfil.</p></div>
        <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={useCurrentLocation}><MapPin className="mr-2 h-4 w-4" />Usar minha localização</Button><span className="text-xs text-muted-foreground">{settings.latitude != null && settings.longitude != null ? "Localização definida" : "Localização ainda não definida"}</span></div>
        {settings.latitude != null && <Button type="button" variant="ghost" size="sm" onClick={() => { set("latitude", null); set("longitude", null); }}>Remover localização salva</Button>}
        <div className="border-t pt-4"><Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar configurações"}</Button></div>
      </form></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />Notificações</CardTitle></CardHeader><CardContent><form onSubmit={save} className="space-y-4">
        <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={settings.notify_messages} onChange={(event) => set("notify_messages", event.target.checked)} /><span>Novas mensagens</span></label>
        <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={settings.notify_local_requests} onChange={(event) => set("notify_local_requests", event.target.checked)} /><span>Novos pedidos na minha região e especialidade</span></label>
        <Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar preferências"}</Button>
      </form></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Alterar senha</CardTitle></CardHeader><CardContent><form onSubmit={changePassword} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="current-password">Senha atual</Label><Input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirme a nova senha</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></div>
        <Button type="submit" disabled={changingPassword}>{changingPassword ? "Alterando..." : "Alterar senha"}</Button>
      </form><p className="mt-4 text-sm text-muted-foreground">Esqueceu sua senha? <Link href="/login?mode=forgot"><a className="font-medium text-primary underline">Recupere por e-mail</a></Link></p></CardContent></Card>
    </>}
  </main></div>;
}
