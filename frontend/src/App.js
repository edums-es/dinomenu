import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, ForceLightMode } from "@/context/ThemeContext";
import { BrandProvider } from "@/context/BrandContext";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const Landing = lazy(() => import("@/pages/Landing"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const MenuPage = lazy(() => import("@/pages/public/MenuPage"));
const TrackOrder = lazy(() => import("@/pages/public/TrackOrder"));
const MyOrders = lazy(() => import("@/pages/public/MyOrders"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Orders = lazy(() => import("@/pages/admin/Orders"));
const Products = lazy(() => import("@/pages/admin/Products"));
const AddonGroups = lazy(() => import("@/pages/admin/AddonGroups"));
const Categories = lazy(() => import("@/pages/admin/Categories"));
const Coupons = lazy(() => import("@/pages/admin/Coupons"));
const Banners = lazy(() => import("@/pages/admin/Banners"));
const Settings = lazy(() => import("@/pages/admin/Settings"));
const Reports = lazy(() => import("@/pages/admin/Reports"));
const Stock = lazy(() => import("@/pages/admin/Stock"));
const Combos = lazy(() => import("@/pages/admin/Combos"));
const Loyalty = lazy(() => import("@/pages/admin/Loyalty"));
const Wholesale = lazy(() => import("@/pages/admin/Wholesale"));
const Customers = lazy(() => import("@/pages/admin/Customers"));
const PDV = lazy(() => import("@/pages/admin/PDV"));
const Suppliers = lazy(() => import("@/pages/admin/Suppliers"));
const Tables = lazy(() => import("@/pages/admin/Tables"));
const Waiters = lazy(() => import("@/pages/admin/Waiters"));
const DeliveryPeople = lazy(() => import("@/pages/admin/DeliveryPeople"));
const WhatsApp = lazy(() => import("@/pages/admin/WhatsApp"));
const AdminAlerts = lazy(() => import("@/pages/admin/Alerts"));
const SuperLayout = lazy(() => import("@/components/super/SuperLayout"));
const SuperDashboard = lazy(() => import("@/pages/super/SuperDashboard"));
const Restaurants = lazy(() => import("@/pages/super/Restaurants"));
const Users = lazy(() => import("@/pages/super/Users"));
const Plans = lazy(() => import("@/pages/super/Plans"));
const Activations = lazy(() => import("@/pages/super/Activations"));
const Billing = lazy(() => import("@/pages/super/Billing"));
const Alerts = lazy(() => import("@/pages/super/Alerts"));
const Affiliates = lazy(() => import("@/pages/super/Affiliates"));
const Resellers = lazy(() => import("@/pages/super/Resellers"));
const PlatformSettings = lazy(() => import("@/pages/super/PlatformSettings"));

function RouteLoader() {
  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      Carregando...
    </div>
  );
}

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/themazuki/master" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === "super_admin" ? "/super" : "/supermaster"} replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <BrandProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteLoader />}>
            <Routes>
            <Route path="/" element={<ForceLightMode><Landing /></ForceLightMode>} />
            <Route path="/themazuki/master" element={<ForceLightMode><LoginPage /></ForceLightMode>} />
            <Route path="/loja/:slug" element={<ForceLightMode><MenuPage /></ForceLightMode>} />
            <Route path="/cardapio/:slug" element={<ForceLightMode><MenuPage /></ForceLightMode>} />
            <Route path="/pedido/:order_id" element={<ForceLightMode><TrackOrder /></ForceLightMode>} />
            <Route path="/meus-pedidos" element={<ForceLightMode><MyOrders /></ForceLightMode>} />
            <Route path="/meus-pedidos/:slug" element={<ForceLightMode><MyOrders /></ForceLightMode>} />

            <Route path="/supermaster" element={<Protected roles={["owner","manager","attendant","kitchen"]}><AdminLayout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="pdv" element={<PDV />} />
              <Route path="caixa" element={<Navigate to="/supermaster/pdv" replace />} />
              <Route path="pedidos" element={<Orders />} />
              <Route path="produtos" element={<Products />} />
              <Route path="adicionais" element={<AddonGroups />} />
              <Route path="categorias" element={<Categories />} />
              <Route path="combos" element={<Combos />} />
              <Route path="estoque" element={<Stock />} />
              <Route path="fornecedores" element={<Suppliers />} />
              <Route path="mesas" element={<Tables />} />
              <Route path="garcons" element={<Waiters />} />
              <Route path="entregadores" element={<DeliveryPeople />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="fidelidade" element={<Loyalty />} />
              <Route path="atacado" element={<Wholesale />} />
              <Route path="cupons" element={<Coupons />} />
              <Route path="banners" element={<Banners />} />
              <Route path="relatorios" element={<Reports />} />
              <Route path="avisos" element={<AdminAlerts />} />
              <Route path="whatsapp" element={<WhatsApp />} />
              <Route path="configuracoes" element={<Settings />} />
            </Route>

            <Route path="/super" element={<Protected roles={["super_admin"]}><SuperLayout /></Protected>}>
              <Route index element={<SuperDashboard />} />
              <Route path="restaurantes" element={<Restaurants />} />
              <Route path="usuarios" element={<Users />} />
              <Route path="planos" element={<Plans />} />
              <Route path="ativacoes" element={<Activations />} />
              <Route path="mensalidades" element={<Billing />} />
              <Route path="alertas" element={<Alerts />} />
              <Route path="afiliados" element={<Affiliates />} />
              <Route path="revenda" element={<Resellers />} />
              <Route path="configuracoes" element={<PlatformSettings />} />
            </Route>

            <Route path="*" element={<ForceLightMode><NotFound /></ForceLightMode>} />
            </Routes>
            </Suspense>
            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}

export default App;
