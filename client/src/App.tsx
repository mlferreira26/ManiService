import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import NotFound from "@/pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import ParaConsumidores from "./pages/ParaConsumidores";
import ParaPrestadores from "./pages/ParaPrestadores";
import ComoFunciona from "./pages/HowItWorks";
import Contato from "./pages/Contato";
import Galeria from "./pages/Galeria";
import Account from "./pages/Account";
import Dashboard from "./pages/Dashboard";
import Communities from "./pages/CommunityRequests";
import Login from "./pages/Login";
import Professionals from "./pages/ProfessionalsLive";
import ProfilePage from "./pages/ProfilePage";
import ProfessionalProfile from "./pages/ProfessionalProfile";
import Messages from "./pages/Messages";
import AccountSettings from "./pages/AccountSettings";
import ActivityFeed from "./pages/ActivityFeed";
import AdminModeration from "./pages/AdminModeration";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-muted-foreground">Verificando seu acesso...</div>;
  return user ? <>{children}</> : <Redirect to="/login" />;
}
function Guarded({ children }: { children: React.ReactNode }) { return <Protected>{children}</Protected>; }

function PublicHome() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Verificando seu acesso...</div>;
  return user ? <Redirect to="/painel" /> : <Home />;
}

function AccountRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Verificando seu acesso...</div>;
  return user ? <Redirect to="/painel" /> : <Account />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Verificando seu acesso...</div>;
  return user && !new URLSearchParams(window.location.search).has("mode") ? <Redirect to="/painel" /> : <Login />;
}

function Router() {
  return <Switch>
    <Route path="/" component={PublicHome} />
    <Route path="/criar-conta" component={AccountRoute} />
    <Route path="/login" component={LoginRoute} />
    <Route path="/inicio"><Guarded><Home /></Guarded></Route>
    <Route path="/para-consumidores"><Guarded><ParaConsumidores /></Guarded></Route>
    <Route path="/para-prestadores"><Guarded><ParaPrestadores /></Guarded></Route>
    <Route path="/como-funciona" component={ComoFunciona} />
    <Route path="/contato"><Guarded><Contato /></Guarded></Route>
    <Route path="/galeria"><Guarded><Galeria /></Guarded></Route>
    <Route path="/painel"><Guarded><Dashboard /></Guarded></Route>
    <Route path="/perfil/:id"><Guarded><ProfessionalProfile /></Guarded></Route>
    <Route path="/perfil"><Guarded><ProfilePage /></Guarded></Route>
    <Route path="/mensagens"><Guarded><Messages /></Guarded></Route>
    <Route path="/configuracoes"><Guarded><AccountSettings /></Guarded></Route>
    <Route path="/servicos"><Guarded><ActivityFeed /></Guarded></Route>
    <Route path="/admin/denuncias"><Guarded><AdminModeration /></Guarded></Route>
    <Route path="/comunidades"><Guarded><Communities /></Guarded></Route>
    <Route path="/profissionais"><Guarded><Professionals /></Guarded></Route>
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><AuthProvider><TooltipProvider><Toaster /><Router /></TooltipProvider></AuthProvider></ThemeProvider></ErrorBoundary>;
}
