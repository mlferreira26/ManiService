import { Link } from "wouter";
import { ArrowDown, ArrowRight, Check, MessageCircle, Search, ShieldCheck, Star, UserRound, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Step = { title: string; text: string; icon: LucideIcon };
const customerSteps: Step[] = [
  { title: "Crie sua conta", text: "Escolha consumidor e complete seus dados básicos.", icon: UserRound },
  { title: "Encontre um profissional", text: "Busque por especialidade e cidade e compare os perfis.", icon: Search },
  { title: "Converse e avalie", text: "Inicie um chat para combinar o serviço e deixe sua avaliação depois.", icon: MessageCircle },
];
const professionalSteps: Step[] = [
  { title: "Monte seu perfil", text: "Informe sua especialidade, região e apresentação profissional.", icon: Wrench },
  { title: "Veja pedidos locais", text: "Consulte as necessidades publicadas pelos consumidores.", icon: Search },
  { title: "Inicie um chat", text: "Converse sobre escopo, prazo e orçamento diretamente com o cliente.", icon: MessageCircle },
];

function Flow({ title, caption, steps, tone }: { title: string; caption: string; steps: Step[]; tone: "blue" | "amber" }) {
  const accent = tone === "blue" ? "bg-blue-50 text-blue-700 ring-blue-100" : "bg-amber-50 text-amber-700 ring-amber-100";
  return <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
    <div className="mb-7"><Badge variant="secondary" className={tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}>{tone === "blue" ? "Para quem contrata" : "Para quem presta serviços"}</Badge><h2 className="mt-3 text-2xl font-bold tracking-tight">{title}</h2><p className="mt-2 text-muted-foreground">{caption}</p></div>
    <div className="grid gap-4 md:grid-cols-3">{steps.map(({ title: stepTitle, text, icon: Icon }, index) => <Card key={stepTitle} className="relative overflow-visible border-slate-200 shadow-none"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${accent}`}><Icon className="h-5 w-5" /></span><span className="text-sm font-semibold text-slate-400">0{index + 1}</span></div><h3 className="font-semibold">{stepTitle}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></CardContent>{index < steps.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-white text-slate-400 md:block" />}</Card>)}</div>
  </section>;
}

export default function HowItWorks() {
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100"><SiteHeader />
    <main>
      <section className="relative isolate overflow-hidden border-b bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="container relative grid gap-10 py-16 md:grid-cols-[1.15fr_0.85fr] md:items-center md:py-24">
          <div><Badge className="gap-2 border border-blue-100 bg-white text-blue-700 shadow-sm hover:bg-white"><ShieldCheck className="h-3.5 w-3.5" />Conexões claras, do primeiro contato à avaliação</Badge><h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">Como funciona o <span className="text-primary">Mani Service</span></h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">A plataforma aproxima pessoas que precisam de um serviço de profissionais da região. Veja o perfil, converse e combine os detalhes.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/criar-conta?perfil=usuario"><a><Button size="lg">Criar conta de consumidor</Button></a></Link><Link href="/criar-conta?perfil=profissional"><a><Button size="lg" variant="outline" className="border-slate-300 bg-white">Sou profissional</Button></a></Link></div><a href="#etapas" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">Conheça as etapas <ArrowDown className="h-4 w-4" /></a></div>
          <Card className="border-white/80 bg-white/90 shadow-xl shadow-blue-900/5"><CardContent className="p-6 md:p-7"><p className="text-sm font-semibold text-slate-500">Uma jornada simples</p><div className="mt-5 space-y-4">{[{ icon: Search, title: "Encontre", text: "Pesquise por serviço e localização." }, { icon: MessageCircle, title: "Converse", text: "Alinhe detalhes diretamente no chat." }, { icon: Star, title: "Avalie", text: "Compartilhe sua experiência no perfil." }].map(({ icon: Icon, title, text }, index) => <div key={title} className="flex items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div><span className="text-xs font-bold text-slate-300">0{index + 1}</span></div>)}</div><div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><Check className="mr-2 inline h-4 w-4 text-emerald-600" />Você combina escopo, prazo e condições direto com a outra pessoa.</div></CardContent></Card>
        </div>
      </section>
      <section id="etapas" className="container space-y-8 py-14 md:py-20"><div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Passo a passo</p><h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Escolha seu caminho</h2><p className="mt-3 text-muted-foreground">Cada perfil tem ferramentas próprias, com uma conversa direta entre consumidor e profissional.</p></div><Flow title="Encontre ajuda para o seu serviço" caption="Do pedido à avaliação, acompanhe tudo pela sua conta." steps={customerSteps} tone="blue" /><Flow title="Apresente seu trabalho e conecte-se" caption="Mostre suas informações e responda a pedidos de consumidores." steps={professionalSteps} tone="amber" /></section>
      <section className="border-t bg-white"><div className="container flex flex-col items-start justify-between gap-5 py-12 md:flex-row md:items-center"><div><p className="text-sm font-semibold text-primary">Pronto para começar?</p><h2 className="mt-2 text-2xl font-bold">Crie sua conta e complete seu perfil.</h2></div><div className="flex flex-wrap gap-3"><Link href="/criar-conta?perfil=usuario"><a><Button>Continuar como consumidor</Button></a></Link><Link href="/criar-conta?perfil=profissional"><a><Button variant="outline">Continuar como profissional</Button></a></Link></div></div></section>
    </main>
    <footer className="border-t bg-slate-50"><div className="container py-6 text-sm text-muted-foreground">© {new Date().getFullYear()} Mani Service</div></footer>
  </div>;
}
