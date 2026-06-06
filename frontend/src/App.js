import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, ForceLightMode } from "@/context/ThemeContext";

import Landing from "@/pages/Landing";
import LoginPage from "@/pages/LoginPage";
import MenuPage from "@/pages/public/MenuPage";
import TrackOrder from "@/pages/public/TrackOrder";
import MyOrders from "@/pages/public/MyOrders";
import AdminLayout from "@/components/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import Orders from "@/pages/admin/Orders";
import Products from "@/pages/admin/Products";
import Categories from "@/pages/admin/Categories";
import Coupons from "@/pages/admin/Coupons";
import Banners from "@/pages/admin/Banners";
import Settings from "@/pages/admin/Settings";
import Reports from "@/pages/admin/Reports";
import Stock from "@/pages/admin/Stock";
import Combos from "@/pages/admin/Combos";
import Loyalty from "@/pages/admin/Loyalty";
import Wholesale from "@/pages/admin/Wholesale";
import Customers from "@/pages/admin/Customers";
import PDV from "@/pages/admin/PDV";
import Suppliers from "@/pages/admin/Suppliers";
import Tables from "@/pages/admin/Tables";
import SuperLayout from "@/components/super/SuperLayout";
import SuperDashboard from "@/pages/super/SuperDashboard";
import Restaurants from "@/pages/super/Restaurants";
import Users from "@/pages/super/Users";
import Plans from "@/pages/super/Plans";
import Activations from "@/pages/super/Activations";
import Billing from "@/pages/super/Billing";
import Alerts from "@/pages/super/Alerts";
import Affiliates from "@/pages/super/Affiliates";
import Resellers from "@/pages/super/Resellers";
import PlatformSettings from "@/pages/super/PlatformSettings";
import WhatsApp from "@/pages/admin/WhatsApp";

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === "super_admin" ? "/super" : "/supermaster"} replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ForceLightMode><Landing /></ForceLightMode>} />
            <Route path="/login" element={<ForceLightMode><LoginPage /></ForceLightMode>} />
            <Route path="/loja/:slug" element={<ForceLightMode><MenuPage /></ForceLightMode>} />
            <Route path="/pedido/:order_id" element={<ForceLightMode><TrackOrder /></ForceLightMode>} />
            <Route path="/meus-pedidos" element={<ForceLightMode><MyOrders /></ForceLightMode>} />
            <Route path="/meus-pedidos/:slug" element={<ForceLightMode><MyOrders /></ForceLightMode>} />

            <Route path="/supermaster" element={<Protected roles={["owner","manager","attendant","kitchen"]}><AdminLayout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="pdv" element={<PDV />} />
              <Route path="caixa" element={<Navigate to="/supermaster/pdv" replace />} />
              <Route path="pedidos" element={<Orders />} />
              <Route path="produtos" element={<Products />} />
              <Route path="categorias" element={<Categories />} />
              <Route path="combos" element={<Combos />} />
              <Route path="estoque" element={<Stock />} />
              <Route path="fornecedores" element={<Suppliers />} />
              <Route path="mesas" element={<Tables />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="fidelidade" element={<Loyalty />} />
              <Route path="atacado" element={<Wholesale />} />
              <Route path="cupons" element={<Coupons />} />
              <Route path="banners" element={<Banners />} />
              <Route path="relatorios" element={<Reports />} />
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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
