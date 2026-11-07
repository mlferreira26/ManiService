import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { CheckCircle, Shield, Clock, Star } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

export default function ParaConsumidores() {
  const beneficios = [
    {
      icon: <Shield className="w-8 h-8" />,
      titulo: "Segurança Garantida",
      descricao: "Todos os profissionais são verificados e avaliados pela comunidade.",
    },
    {
      icon: <Clock className="w-8 h-8" />,
      titulo: "Agendamento Rápido",
      descricao: "Encontre e contrate serviços em poucos cliques.",
    },
    {
      icon: <Star className="w-8 h-8" />,
      titulo: "Avaliações Reais",
      descricao: "Veja as avaliações de outros clientes antes de contratar.",
    },
    {
      icon: <CheckCircle className="w-8 h-8" />,
      titulo: "Transparência Total",
      descricao: "Preços claros e sem surpresas. Você sabe exatamente o que vai pagar.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Encontre Profissionais Confiáveis
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Contrate serviços com segurança, rapidez e transparência. Acesse profissionais qualificados na sua região.
          </p>
          <Link href="/profissionais"><a><Button size="lg" className="mr-4">Encontrar profissionais</Button></a></Link>
          <Button size="lg" variant="outline" onClick={() => document.getElementById("beneficios")?.scrollIntoView({ behavior: "smooth" })}>Saiba Mais</Button>
        </div>
      </section>

      {/* Benefícios */}
      <section id="beneficios" className="scroll-mt-24 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Por Que Escolher Mani Service?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {beneficios.map((beneficio, idx) => (
              <Card key={idx} className="p-6 hover:shadow-lg transition-shadow">
                <div className="text-primary mb-4">{beneficio.icon}</div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                  {beneficio.titulo}
                </h3>
                <p className="text-muted-foreground">{beneficio.descricao}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section id="como-funciona" className="scroll-mt-24 py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Como Funciona
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { num: 1, titulo: "Busque", desc: "Procure por serviços na sua região" },
              { num: 2, titulo: "Escolha", desc: "Selecione o profissional ideal" },
              { num: 3, titulo: "Contrate", desc: "Agende o serviço com segurança" },
              { num: 4, titulo: "Avalie", desc: "Deixe sua avaliação após o serviço" },
            ].map((passo) => (
              <div key={passo.num} className="text-center">
                <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                  {passo.num}
                </div>
                <h3 className="font-semibold mb-2 text-foreground">{passo.titulo}</h3>
                <p className="text-sm text-muted-foreground">{passo.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            Pronto para Começar?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Cadastre-se agora e tenha acesso a profissionais qualificados.
          </p>
          <Link href="/comunidades"><a><Button size="lg">Publicar um pedido</Button></a></Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 Mani Service. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
