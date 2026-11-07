import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

export default function ComoFunciona() {
  const fluxoCliente = [
    {
      titulo: "1. Cadastro",
      descricao: "Crie sua conta com seus dados pessoais e informações de contato.",
    },
    {
      titulo: "2. Busca",
      descricao: "Procure por serviços específicos na sua região.",
    },
    {
      titulo: "3. Seleção",
      descricao: "Escolha o profissional ideal com base em avaliações e experiência.",
    },
    {
      titulo: "4. Agendamento",
      descricao: "Converse com o profissional para combinar os detalhes do serviço.",
    },
    {
      titulo: "5. Pagamento",
      descricao: "Combine valor e condições diretamente com o profissional.",
    },
    {
      titulo: "6. Avaliação",
      descricao: "Após o serviço, deixe sua avaliação e feedback.",
    },
  ];

  const fluxoProfissional = [
    {
      titulo: "1. Cadastro",
      descricao: "Registre-se como profissional com suas especialidades.",
    },
    {
      titulo: "2. Perfil",
      descricao: "Complete seu perfil com portfólio e experiências.",
    },
    {
      titulo: "3. Disponibilidade",
      descricao: "Consulte pedidos de serviço publicados na comunidade.",
    },
    {
      titulo: "4. Notificações",
      descricao: "Inicie um chat com o consumidor que publicou um pedido.",
    },
    {
      titulo: "5. Confirmação",
      descricao: "Converse para alinhar escopo, prazo e orçamento.",
    },
    {
      titulo: "6. Recebimento",
      descricao: "Peça ao cliente para avaliar o serviço concluído.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Como Funciona o Mani Service
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Entenda o fluxo completo de como conectamos consumidores e profissionais.
          </p>
        </div>
      </section>

      {/* Fluxo Cliente */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Para Consumidores
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fluxoCliente.map((passo, idx) => (
              <Card key={idx} className="p-6 relative">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">
                      {passo.titulo}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {passo.descricao}
                    </p>
                  </div>
                </div>
                {idx < fluxoCliente.length - 1 && (
                  <div className="hidden lg:block absolute -right-3 top-1/2 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Fluxo Profissional */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Para Prestadores de Serviço
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fluxoProfissional.map((passo, idx) => (
              <Card key={idx} className="p-6 bg-background relative">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">
                      {passo.titulo}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {passo.descricao}
                    </p>
                  </div>
                </div>
                {idx < fluxoProfissional.length - 1 && (
                  <div className="hidden lg:block absolute -right-3 top-1/2 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Segurança */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Segurança em Cada Etapa
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                titulo: "Perfis transparentes",
                desc: "Consulte as informações e avaliações disponíveis em cada perfil.",
              },
              {
                titulo: "Conversa direta",
                desc: "Alinhe detalhes do serviço pelo chat antes de combinar a contratação.",
              },
              {
                titulo: "Avaliações de perfil",
                desc: "Leia comentários e notas que usuários publicaram nos perfis profissionais.",
              },
            ].map((seguranca, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8 bg-primary rounded-full"></div>
                </div>
                <h3 className="font-semibold mb-2 text-foreground">
                  {seguranca.titulo}
                </h3>
                <p className="text-muted-foreground text-sm">{seguranca.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            Pronto para Começar?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Junte-se à comunidade Mani Service e comece a conectar-se com oportunidades.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/criar-conta?perfil=usuario"><a><Button size="lg">Sou Consumidor</Button></a></Link>
            <Link href="/criar-conta?perfil=profissional"><a><Button size="lg" variant="outline">Sou Profissional</Button></a></Link>
          </div>
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
