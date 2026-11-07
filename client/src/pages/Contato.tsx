import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { Mail, Phone, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Contato() {
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    assunto: "",
    mensagem: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.nome ||
      !formData.email ||
      !formData.assunto ||
      !formData.mensagem
    ) {
      toast.error("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    toast.success("Mensagem enviada com sucesso! Em breve entraremos em contato.");
    setFormData({
      nome: "",
      email: "",
      telefone: "",
      assunto: "",
      mensagem: "",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <Link href="/">
            <a className="text-lg font-bold text-primary hover:text-primary/80">
              Mani Service
            </a>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Entre em Contato
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Tem dúvidas? Queremos ouvir você! Entre em contato conosco.
          </p>
        </div>
      </section>

      {/* Contact Info */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="p-8 text-center">
              <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2 text-foreground">Email</h3>
              <p className="text-muted-foreground">matheuslavaqui1@gmail.com</p>
            </Card>
            <Card className="p-8 text-center">
              <Phone className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2 text-foreground">Telefone</h3>
              <p className="text-muted-foreground">(45) 99981-4872</p>
            </Card>
            <Card className="p-8 text-center">
              <MapPin className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2 text-foreground">Localização</h3>
              <p className="text-muted-foreground">Toledo, Pr - Brasil</p>
            </Card>
          </div>

          {/* Contact Form */}
          <div className="max-w-2xl mx-auto">
            <Card className="p-8">
              <h2 className="text-2xl font-bold mb-6 text-foreground">
                Envie-nos uma Mensagem
              </h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Nome *
                    </label>
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                      placeholder="Seu nome"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                    placeholder="(11) 9999-9999"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Assunto *
                  </label>
                  <select
                    name="assunto"
                    value={formData.assunto}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                  >
                    <option value="">Selecione um assunto</option>
                    <option value="duvida">Dúvida Geral</option>
                    <option value="suporte">Suporte Técnico</option>
                    <option value="parceria">Parceria</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Mensagem *
                  </label>
                  <textarea
                    name="mensagem"
                    value={formData.mensagem}
                    onChange={handleChange}
                    rows={6}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground resize-none"
                    placeholder="Digite sua mensagem aqui..."
                  ></textarea>
                </div>

                <Button type="submit" size="lg" className="w-full">
                  Enviar Mensagem
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Perguntas Frequentes
          </h2>
          <div className="max-w-2xl mx-auto space-y-4">
            {[
              {
                pergunta: "Como me cadastro no Mani Service?",
                resposta:
                  "Você pode se cadastrar através do nosso site ou aplicativo. Basta fornecer seus dados pessoais e escolher se é consumidor ou profissional.",
              },
              {
                pergunta: "Qual é o custo para usar o Mani Service?",
                resposta:
                  "O cadastro é gratuito. Você só paga quando contrata um serviço, e a plataforma cobra uma pequena taxa sobre a transação.",
              },
              {
                pergunta: "Como funciona o pagamento?",
                resposta:
                  "O pagamento protegido pelo PagSeguro está sendo configurado. Quando estiver disponível, o valor ficará retido pelo provedor e será liberado ao profissional depois que você confirmar a conclusão do serviço. A comissão da plataforma será de 4% do orçamento e será descontada do repasse ao profissional.",
              },
              {
                pergunta: "Como reportar um problema?",
                resposta:
                  "Você pode entrar em contato conosco através do formulário acima ou enviar um email para contato@maniservice.com.",
              },
            ].map((faq, idx) => (
              <Card key={idx} className="p-6">
                <h3 className="font-semibold mb-2 text-foreground">
                  {faq.pergunta}
                </h3>
                <p className="text-muted-foreground text-sm">{faq.resposta}</p>
              </Card>
            ))}
          </div>
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
