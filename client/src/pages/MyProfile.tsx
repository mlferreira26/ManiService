import { FormEvent, useEffect, useState } from "react";
import { MapPin, Save, UserRound, Wrench } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type ProfileData = Record<string, string | number | boolean | null>;
const emptyProfile: ProfileData = { name: "", phone: "", bio: "", address_line: "", neighborhood: "", city: "", state: "", postal_code: "", specialty: "", professional_description: "", service_radius_km: "", hourly_rate: "" };

export default function MyProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.profile().then(({ profile }) => setProfile(profile)).catch((error) => toast.error(error.message)).finally(() => setLoading(false)); }, []);
  const set = (key: string, value: string) => setProfile((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const { profile: saved } = await api.updateProfile({ name: profile.name, phone: profile.phone, bio: profile.bio, addressLine: profile.address_line, neighborhood: profile.neighborhood, city: profile.city, state: profile.state, postalCode: profile.postal_code, specialty: profile.specialty, professionalDescription: profile.professional_description, serviceRadiusKm: profile.service_radius_km || null, hourlyRate: profile.hourly_rate || null });
      setProfile(saved); toast.success("Perfil salvo com sucesso.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o perfil."); }
    finally { setSaving(false); }
  }
  const initials = String(profile.name || user?.name || "MS").split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader /><main className="container max-w-4xl py-8 md:py-12"><div className="mb-7"><Badge variant="secondary" className="mb-3">Meu espaço</Badge><h1 className="text-3xl font-bold">Meu perfil</h1><p className="mt-2 text-muted-foreground">Mantenha seus dados atualizados para facilitar o contato e a contratação.</p></div>
    <Card><CardHeader className="flex flex-row items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">{initials}</div><div><CardTitle>{profile.name || user?.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{user?.email}</p><Badge className="mt-2" variant="outline">{user?.role === "profissional" ? "Profissional" : "Consumidor"}</Badge></div></CardHeader>
    <CardContent>{loading ? <p className="py-8 text-center text-muted-foreground">Carregando perfil...</p> : <form onSubmit={submit} className="space-y-7">
      <section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />Dados pessoais</h2><div className="space-y-2"><Label htmlFor="profile-name">Nome</Label><Input id="profile-name" required value={String(profile.name || "")} onChange={(e) => set("name", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-phone">Telefone</Label><Input id="profile-phone" value={String(profile.phone || "")} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="profile-bio">Sobre você</Label><Textarea id="profile-bio" value={String(profile.bio || "")} onChange={(e) => set("bio", e.target.value)} placeholder="Conte um pouco sobre você" /></div></section>
      <section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" />Localização</h2><div className="space-y-2"><Label htmlFor="profile-city">Cidade</Label><Input id="profile-city" value={String(profile.city || "")} onChange={(e) => set("city", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-state">Estado (UF)</Label><Input id="profile-state" maxLength={2} value={String(profile.state || "")} onChange={(e) => set("state", e.target.value.toUpperCase())} /></div><div className="space-y-2"><Label htmlFor="profile-neighborhood">Bairro</Label><Input id="profile-neighborhood" value={String(profile.neighborhood || "")} onChange={(e) => set("neighborhood", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-postal">CEP</Label><Input id="profile-postal" value={String(profile.postal_code || "")} onChange={(e) => set("postal_code", e.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="profile-address">Endereço</Label><Input id="profile-address" value={String(profile.address_line || "")} onChange={(e) => set("address_line", e.target.value)} /></div></section>
      {user?.role === "profissional" && <section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" />Perfil profissional</h2><div className="space-y-2"><Label htmlFor="profile-specialty">Especialidade</Label><Input id="profile-specialty" value={String(profile.specialty || "")} onChange={(e) => set("specialty", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-rate">Valor por hora (R$)</Label><Input id="profile-rate" type="number" min="0" step="0.01" value={String(profile.hourly_rate || "")} onChange={(e) => set("hourly_rate", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-radius">Raio de atendimento (km)</Label><Input id="profile-radius" type="number" min="1" value={String(profile.service_radius_km || "")} onChange={(e) => set("service_radius_km", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="profile-description">Apresentação profissional</Label><Input id="profile-description" value={String(profile.professional_description || "")} onChange={(e) => set("professional_description", e.target.value)} /></div></section>}
      <div className="flex justify-end border-t pt-5"><Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar alterações"}</Button></div>
    </form>}</CardContent></Card></main></div>;
}
