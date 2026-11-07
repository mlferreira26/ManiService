import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { TrendingUp, Users, Briefcase, Award } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

export default function ParaPrestadores() {
  const oportunidades = [
    {
      icon: <TrendingUp className="w-8 h-8" />,
      titulo: "Aumente Sua Renda",
      descricao: "Apareça nas buscas de clientes pela sua especialidade e cidade.",
    },
    {
      icon: <Users className="w-8 h-8" />,
      titulo: "Visibilidade Profissional",
      descricao: "Publique trabalhos e mantenha sua apresentação profissional atualizada.",
    },
    {
      icon: <Briefcase className="w-8 h-8" />,
      titulo: "Gerenciamento Fácil",
      descricao: "Encontre pedidos de consumidores e converse pelo chat da plataforma.",
    },
    {
      icon: <Award className="w-8 h-8" />,
      titulo: "Reconhecimento",
      descricao: "Receba avaliações reais de clientes no seu perfil.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Expanda Seu Negócio
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Conecte-se com clientes que procuram seus serviços. Cresça de forma segura e profissional.
          </p>
          <Link href="/criar-conta?perfil=profissional"><a><Button size="lg" className="mr-4">Cadastre-se Agora</Button></a></Link>
          <a href="#beneficios"><Button size="lg" variant="outline">Saiba Mais</Button></a>
        </div>
      </section>

      {/* Oportunidades */}
      <section id="beneficios" className="py-16 scroll-mt-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Benefícios para Profissionais
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {oportunidades.map((oportunidade, idx) => (
              <Card key={idx} className="p-6 hover:shadow-lg transition-shadow">
                <div className="text-primary mb-4">{oportunidade.icon}</div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                  {oportunidade.titulo}
                </h3>
                <p className="text-muted-foreground">{oportunidade.descricao}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Ferramentas Poderosas
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                titulo: "Pedidos da comunidade",
                desc: "Consulte necessidades publicadas por consumidores.",
              },
              {
                titulo: "Portfólio Digital",
                desc: "Mostre seus trabalhos e conquiste a confiança dos clientes.",
              },
              {
                titulo: "Chat direto",
                desc: "Converse com clientes sobre escopo, prazo e orçamento.",
              },
              {
                titulo: "Avaliações e feedback",
                desc: "Acompanhe as avaliações publicadas no seu perfil.",
              },
            ].map((recurso, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <div className="w-6 h-6 bg-primary rounded-full"></div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">
                    {recurso.titulo}
                  </h3>
                  <p className="text-muted-foreground text-sm">{recurso.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            Comece Sua Jornada Profissional
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Crie seu perfil profissional, apresente seus serviços e receba contatos de clientes.
          </p>
          <Link href="/criar-conta?perfil=profissional"><a><Button size="lg">Criar Conta Profissional</Button></a></Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Mani Service. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
