import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useOneSignal } from "@/hooks/useOneSignal";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ClipboardList, UtensilsCrossed, FolderTree, Ticket,
  Image, BarChart3, Settings, LogOut, Menu, X, ExternalLink,
  PackageSearch, Gift, Layers, Users, Building2, ShoppingCart,
  Wallet, Truck, QrCode, ChevronDown, ChevronRight, MessageCircle,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Operação",
    items: [
      { to: "/supermaster",          label: "Dashboard",    icon: LayoutDashboard, end: true },
      { to: "/supermaster/pdv",      label: "PDV / Caixa",  icon: ShoppingCart },
      { to: "/supermaster/pedidos",  label: "Pedidos",      icon: ClipboardList },
      { to: "/supermaster/mesas",    label: "Mesas / QR",   icon: QrCode },
    ],
  },
  {
    label: "Cardápio",
    items: [
      { to: "/supermaster/produtos",   label: "Produtos",    icon: UtensilsCrossed },
      { to: "/supermaster/categorias", label: "Categorias",  icon: FolderTree },
      { to: "/supermaster/combos",     label: "Combos",      icon: Layers },
      { to: "/supermaster/banners",    label: "Banners",     icon: Image },
    ],
  },
  {
    label: "Estoque",
    items: [
      { to: "/supermaster/estoque",      label: "Estoque",      icon: PackageSearch },
      { to: "/supermaster/fornecedores", label: "Fornecedores", icon: Truck },
    ],
  },
  {
    label: "Clientes",
    items: [
      { to: "/supermaster/clientes",   label: "Clientes",    icon: Users },
      { to: "/supermaster/fidelidade", label: "Fidelidade",  icon: Gift },
      { to: "/supermaster/atacado",    label: "Atacado",     icon: Building2 },
      { to: "/supermaster/cupons",     label: "Cupons",      icon: Ticket },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/supermaster/relatorios",   label: "Relatórios",    icon: BarChart3 },
      { to: "/supermaster/whatsapp",     label: "WhatsApp",      icon: MessageCircle },
      { to: "/supermaster/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function NavGroup({ group, onClose }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
        {group.label}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="space-y-0.5">
          {group.items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-900 dark:bg-white/10 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-100"
                }`
              }>
              <n.icon className="w-4 h-4 shrink-0" /> {n.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  useOneSignal({ restaurantId: user?.restaurant_id, enabled: !!user?.restaurant_id });
  const { } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [restaurantSlug, setRestaurantSlug] = useState("burger-lanches");
  useEffect(() => {
    api.get("/admin/restaurant/slug").then((r) => setRestaurantSlug(r.data.slug)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0A0A0A] font-admin text-gray-900 dark:text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed lg:static z-50 inset-y-0 left-0 w-64 bg-white dark:bg-[#111111] border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-gray-900 dark:bg-gray-700 text-white">
            <UtensilsCrossed className="w-4 h-4" />
          </span>
          <span className="font-display font-bold text-lg tracking-tight">EG Delivery</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 scrollbar-hide">
          {NAV_GROUPS.map((g) => <NavGroup key={g.label} group={g} onClose={() => setOpen(false)} />)}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-gray-900 dark:bg-gray-700 text-white grid place-items-center text-xs font-bold shrink-0">
              {(user?.name || "U")[0].toUpperCase()}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.name}</span>
          </div>
          <Button variant="ghost" onClick={() => { logout(); navigate("/login"); }}
            className="w-full justify-start text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0 flex flex-col max-w-full">
        <header className="h-14 bg-white dark:bg-[#111111] border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sticky top-0 z-30">
          <button className="lg:hidden text-gray-500 dark:text-gray-400" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link to={`/loja/${restaurantSlug}`} target="_blank"
              className="hidden sm:flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Ver cardápio <ExternalLink className="w-3 h-3" />
            </Link>
            <div className="w-8 h-8 rounded-full bg-gray-900 dark:bg-gray-700 text-white grid place-items-center text-xs font-bold">
              {(user?.name || "U")[0].toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-full p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden">
          <div className="w-full max-w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
