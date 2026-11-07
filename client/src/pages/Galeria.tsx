import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { useState } from "react";
import { X, Star, MapPin } from "lucide-react";

interface Trabalho {
  id: number;
  imagem: string;
  titulo: string;
  profissional: string;
  categoria: string;
  avaliacao: number;
  localizacao: string;
  descricao: string;
}

export default function Galeria() {
  const [selectedWork, setSelectedWork] = useState<Trabalho | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");

  const trabalhos: Trabalho[] = [
    {
      id: 1,
      imagem: "/trabalho-1.jpg",
      titulo: "Instalação de Torneira Moderna",
      profissional: "João Silva - Encanador",
      categoria: "Encanamento",
      avaliacao: 5,
      localizacao: "São Paulo, SP",
      descricao: "Instalação profissional de torneira cromada moderna em banheiro.",
    },
    {
      id: 2,
      imagem: "/trabalho-2.jpg",
      titulo: "Painel Elétrico Organizado",
      profissional: "Carlos Oliveira - Eletricista",
      categoria: "Eletricidade",
      avaliacao: 5,
      localizacao: "São Paulo, SP",
      descricao: "Instalação e organização completa de painel elétrico com circuitos bem distribuídos.",
    },
    {
      id: 3,
      imagem: "/trabalho-3.jpg",
      titulo: "Pintura de Parede Perfeita",
      profissional: "Maria Santos - Pintora",
      categoria: "Pintura",
      avaliacao: 4.8,
      localizacao: "São Paulo, SP",
      descricao: "Pintura de parede com acabamento profissional e cores modernas.",
    },
    {
      id: 4,
      imagem: "/trabalho-4.jpg",
      titulo: "Armário de Madeira Personalizado",
      profissional: "Pedro Costa - Carpinteiro",
      categoria: "Carpintaria",
      avaliacao: 5,
      localizacao: "São Paulo, SP",
      descricao: "Fabricação e instalação de armário de madeira com acabamento impecável.",
    },
    {
      id: 5,
      imagem: "/trabalho-5.jpg",
      titulo: "Limpeza Profissional de Cozinha",
      profissional: "Ana Martins - Limpeza",
      categoria: "Limpeza",
      avaliacao: 4.9,
      localizacao: "São Paulo, SP",
      descricao: "Limpeza profunda e organização completa de cozinha moderna.",
    },
  ];

  const categorias = [
    "todas",
    "Encanamento",
    "Eletricidade",
    "Pintura",
    "Carpintaria",
    "Limpeza",
  ];

  const trabalhosFiltrados =
    filtroCategoria === "todas"
      ? trabalhos
      : trabalhos.filter((t) => t.categoria === filtroCategoria);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/">
            <a className="text-2xl font-bold text-primary hover:text-primary/80">
              Mani Service
            </a>
          </Link>
          <div className="hidden md:flex gap-8">
            <Link href="/para-consumidores">
              <a className="text-foreground hover:text-primary transition-colors">
                Para Consumidores
              </a>
            </Link>
            <Link href="/para-prestadores">
              <a className="text-foreground hover:text-primary transition-colors">
                Para Profissionais
              </a>
            </Link>
            <Link href="/galeria">
              <a className="text-foreground hover:text-primary transition-colors font-semibold">
                Galeria
              </a>
            </Link>
            <Link href="/contato">
              <a className="text-foreground hover:text-primary transition-colors">
                Contato
              </a>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Galeria de Trabalhos
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Conheça os trabalhos realizados pelos nossos profissionais cadastrados.
            Veja a qualidade e profissionalismo em cada projeto.
          </p>
        </div>
      </section>

      {/* Filtros */}
      <section className="py-8 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-lg font-semibold mb-4 text-foreground">
            Filtrar por Categoria
          </h2>
          <div className="flex flex-wrap gap-3">
            {categorias.map((categoria) => (
              <button
                key={categoria}
                onClick={() => setFiltroCategoria(categoria)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filtroCategoria === categoria
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border border-border hover:border-primary"
                }`}
              >
                {categoria.charAt(0).toUpperCase() + categoria.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Galeria */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trabalhosFiltrados.map((trabalho) => (
              <Card
                key={trabalho.id}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => setSelectedWork(trabalho)}
              >
                <div className="relative h-64 overflow-hidden bg-muted">
                  <img
                    src={trabalho.imagem}
                    alt={trabalho.titulo}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Button
                      variant="secondary"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-2 text-foreground line-clamp-2">
                    {trabalho.titulo}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {trabalho.profissional}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(trabalho.avaliacao)
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      ))}
                      <span className="text-sm font-medium ml-1 text-foreground">
                        {trabalho.avaliacao}
                      </span>
                    </div>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      {trabalho.categoria}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {trabalhosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-lg text-muted-foreground">
                Nenhum trabalho encontrado nesta categoria.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Modal de Detalhes */}
      {selectedWork && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="relative">
              <button
                onClick={() => setSelectedWork(null)}
                className="absolute top-4 right-4 z-10 bg-background rounded-full p-2 hover:bg-muted"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={selectedWork.imagem}
                alt={selectedWork.titulo}
                className="w-full h-96 object-cover"
              />
            </div>
            <div className="p-6">
              <h2 className="text-3xl font-bold mb-4 text-foreground">
                {selectedWork.titulo}
              </h2>

              <div className="space-y-4 mb-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Profissional
                  </h3>
                  <p className="text-muted-foreground">{selectedWork.profissional}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">
                      Avaliação
                    </h3>
                    <div className="flex items-center gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-5 h-5 ${
                            i < Math.floor(selectedWork.avaliacao)
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      ))}
                      <span className="font-bold text-lg text-foreground ml-2">
                        {selectedWork.avaliacao}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-2">
                      Categoria
                    </h3>
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                      {selectedWork.categoria}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Localização
                  </h3>
                  <p className="text-muted-foreground">{selectedWork.localizacao}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2">Descrição</h3>
                  <p className="text-muted-foreground">{selectedWork.descricao}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Button size="lg" className="flex-1">
                  Contratar Profissional
                </Button>
                <Button size="lg" variant="outline" className="flex-1">
                  Enviar Mensagem
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* CTA */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            Impressionado com os Trabalhos?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Contrate um profissional qualificado para seu próximo projeto.
          </p>
          <Link href="/para-consumidores">
            <Button size="lg">Buscar Profissional Agora</Button>
          </Link>
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
