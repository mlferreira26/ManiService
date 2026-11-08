import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Paintbrush, Zap, Droplets, Hammer, Search, ShieldCheck, MessageCircle, ClipboardList, BriefcaseBusiness } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SiteHeader from "@/components/SiteHeader";

const categories = [
  { name: "Elétrica", detail: "Instalações e reparos", icon: Zap, color: "bg-amber-100 text-amber-700" },
  { name: "Hidráulica", detail: "Vazamentos e encanamento", icon: Droplets, color: "bg-sky-100 text-sky-700" },
  { name: "Pintura", detail: "Pintura e acabamento", icon: Paintbrush, color: "bg-rose-100 text-rose-700" },
  { name: "Reformas", detail: "Montagem e manutenção", icon: Hammer, color: "bg-violet-100 text-violet-700" },
];

export default function Home() {
  const [query, setQuery] = useState("");
  return <div className="min-h-screen bg-gradient-to-br from-slate-200 via-blue-50 to-slate-100 text-slate-900">
    <SiteHeader />
    <main>
      <section className="relative isolate overflow-hidden border-b border-slate-200 bg-gradient-to-br from-slate-200 via-slate-100 to-blue-100/80">
        <div className="pointer-events-none absolute -right-24 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-blue-300/35 blur-3xl" />
        <div className="container grid min-h-[520px] items-center gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-sm font-semibold text-blue-800 shadow-sm"><span className="h-2 w-2 rounded-full bg-emerald-500" />Talento local, trabalho bem feito</div>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">O profissional certo para <span className="text-blue-700">resolver de verdade.</span></h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Encontre trabalhadores autônomos da sua região, conheça o trabalho deles e converse diretamente para combinar seu serviço.</p>
            <form className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-blue-900/5 sm:flex-row" onSubmit={(event) => { event.preventDefault(); window.location.href = `/profissionais${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`; }}>
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3"><Search className="h-5 w-5 shrink-0 text-blue-700" /><Input aria-label="Serviço ou profissional" className="border-0 px-0 shadow-none focus-visible:ring-0" placeholder="Qual serviço você precisa?" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
              <Button type="submit" className="h-11 rounded-xl px-6">Buscar profissionais <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
            <p className="mt-3 text-xs text-slate-500">Pesquise por serviço, especialidade ou nome.</p>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -left-5 top-10 h-24 w-24 rounded-3xl bg-amber-300/70" />
            <div className="absolute -bottom-5 -right-3 h-32 w-32 rounded-full bg-blue-200/80" />
            <div className="relative aspect-[1.12] overflow-hidden rounded-[2rem] border-8 border-white bg-blue-100 shadow-2xl shadow-blue-950/20">
              <img src="/hero-jardim.png" alt="Moradora olhando o jardim e procurando ajuda para cuidar dele" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/10" />
              <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-blue-900 shadow-lg backdrop-blur-sm sm:left-7 sm:top-7"><span className="h-2 w-2 rounded-full bg-emerald-500" />Ajuda para sua casa, perto de você</div>
              <div className="absolute bottom-5 left-5 max-w-[55%] text-white drop-shadow-md sm:bottom-7 sm:left-7"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">ManiService</p><p className="mt-1 text-xl font-bold leading-tight sm:text-2xl">Do jardim ao reparo,<br />encontre quem resolve.</p></div>
              <div className="absolute bottom-5 right-4 w-[38%] overflow-hidden rounded-2xl border-4 border-white shadow-2xl sm:bottom-7 sm:right-6">
                <img src="/hero-parede.png" alt="Moradora fotografando uma parede que precisa de reparo" className="aspect-[4/3] w-full object-cover" />
                <div className="bg-white px-2 py-2 text-[10px] font-semibold leading-tight text-slate-800 sm:px-3 sm:text-xs">Parede precisando de reparo?</div>
              </div>
            </div>
            <div className="absolute -bottom-7 left-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-lg sm:left-[-2rem]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><ShieldCheck className="h-5 w-5" /></span><span><span className="block text-sm font-bold">Conheça antes de combinar</span><span className="block text-xs text-slate-500">Perfil, avaliações e conversa direta</span></span></div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200/80 py-16 md:py-20">
        <div className="container">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-widest text-amber-700">Encontre por categoria</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Que serviço você precisa?</h2></div><Link href="/profissionais"><a className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-900">Ver todos <ArrowRight className="h-4 w-4" /></a></Link></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{categories.map(({ name, detail, icon: Icon, color }, index) => <Link key={name} href={`/profissionais?search=${encodeURIComponent(name)}`}><a className="group flex min-h-56 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"><span className={`relative flex h-24 items-end overflow-hidden p-4 ${["bg-amber-50", "bg-sky-50", "bg-rose-50", "bg-violet-50"][index]}`}><span className="absolute -right-3 -top-8 h-28 w-28 rounded-full bg-white/70" /><span className={`relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${color}`}><Icon className="h-6 w-6" /></span></span><span className="flex flex-1 flex-col p-5"><span className="block text-lg font-bold">{name}</span><span className="mt-1 block text-sm text-slate-500">{detail}</span><span className="mt-auto inline-flex items-center pt-5 text-sm font-semibold text-blue-700">Explorar <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-1" /></span></span></a></Link>)}</div>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-gradient-to-r from-slate-200/80 via-slate-100/90 to-blue-100/70 py-16 md:py-20"><div className="container"><div className="mx-auto mb-10 max-w-2xl text-center"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Do primeiro contato ao serviço</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Simples para os dois lados</h2><p className="mt-3 text-slate-600">Cada pessoa sabe qual é o próximo passo.</p></div><div className="grid gap-5 md:grid-cols-2"><div className="rounded-3xl bg-blue-50 p-7 md:p-9"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white"><ClipboardList className="h-6 w-6" /></span><h3 className="mt-5 text-xl font-bold">Precisa de um serviço?</h3><ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700"><li><b className="mr-2 text-blue-700">01</b>Busque profissionais ou publique seu pedido.</li><li><b className="mr-2 text-blue-700">02</b>Compare perfis e converse sobre o orçamento.</li><li><b className="mr-2 text-blue-700">03</b>Combine os detalhes diretamente e acompanhe o pedido.</li></ol><Link href="/profissionais"><a><Button className="mt-6 rounded-xl">Encontrar profissional <ArrowRight className="ml-2 h-4 w-4" /></Button></a></Link></div><div className="rounded-3xl bg-amber-50 p-7 md:p-9"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white"><BriefcaseBusiness className="h-6 w-6" /></span><h3 className="mt-5 text-xl font-bold">Trabalha por conta própria?</h3><ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700"><li><b className="mr-2 text-amber-700">01</b>Crie seu perfil e mostre o que sabe fazer.</li><li><b className="mr-2 text-amber-700">02</b>Encontre pedidos publicados por clientes.</li><li><b className="mr-2 text-amber-700">03</b>Envie seu orçamento e combine o serviço.</li></ol><Link href="/criar-conta?perfil=profissional"><a><Button variant="outline" className="mt-6 rounded-xl border-amber-300 bg-white text-amber-800 hover:bg-amber-100">Quero oferecer serviços <ArrowRight className="ml-2 h-4 w-4" /></Button></a></Link></div></div></div></section>

      <section className="container py-14"><div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-slate-900 p-8 text-white md:flex-row md:items-center md:p-10"><div className="max-w-xl"><p className="text-sm font-bold uppercase tracking-widest text-amber-300">Conexão de verdade</p><h2 className="mt-2 text-2xl font-bold">Um bom trabalho começa com uma boa conversa.</h2><p className="mt-2 text-sm leading-6 text-slate-300">Veja as informações disponíveis no perfil e alinhe escopo, preço e prazo com o profissional.</p></div><Link href="/profissionais"><a><Button className="rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300"><MessageCircle className="mr-2 h-4 w-4" />Começar a buscar</Button></a></Link></div></section>
    </main>
    <footer className="border-t border-slate-200 bg-slate-100/90 py-8"><div className="container flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row"><span className="font-bold text-blue-800">ManiService</span><span>Conectando clientes e trabalhadores autônomos.</span><Link href="/como-funciona"><a className="font-medium text-blue-700 hover:underline">Como funciona</a></Link></div></footer>
  </div>;
}
