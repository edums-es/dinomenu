import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useBrand } from "@/context/BrandContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Store, Users, LogOut, ShieldCheck,
  CreditCard, DollarSign, UserPlus, Handshake, Layers, Bell,
  ChevronDown, ChevronRight, Menu, Settings,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Visão Geral",
    items: [
      { to: "/super", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/super/alertas", label: "Alertas", icon: Bell },
    ],
  },
  {
    label: "Negócio",
    items: [
      { to: "/super/planos", label: "Planos", icon: Layers },
      { to: "/super/ativacoes", label: "Ativações", icon: CreditCard },
      { to: "/super/mensalidades", label: "Mensalidades", icon: DollarSign },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { to: "/super/afiliados", label: "Afiliados", icon: UserPlus },
      { to: "/super/revenda", label: "Revenda", icon: Handshake },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { to: "/super/restaurantes", label: "Restaurantes", icon: Store },
      { to: "/super/usuarios", label: "Usuários", icon: Users },
      { to: "/super/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function NavGroup({ group, onClose }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-400 transition-colors"
      >
        {group.label}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open &&
        group.items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-500 text-white"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`
            }
          >
            <n.icon className="w-4 h-4 shrink-0" /> {n.label}
          </NavLink>
        ))}
    </div>
  );
}

export default function SuperLayout() {
  const { user, logout } = useAuth();
  const { brand } = useBrand();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="admin-shell admin-dark min-h-[100dvh] bg-[#0A0A0A] font-admin text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`w-60 bg-[#111111] border-r border-white/5 flex flex-col fixed lg:static inset-y-0 z-40 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-white/5 shrink-0">
          {brand.logo_url ? (
            <img src={brand.logo_url} alt={brand.name} className="w-9 h-9 rounded-lg object-contain bg-white/5 p-1" />
          ) : (
            <span className="grid place-items-center w-8 h-8 rounded-lg" style={{ background: brand.primary_color }}>
              <ShieldCheck className="w-4 h-4 text-white" />
            </span>
          )}
          <div>
            <p className="font-display font-bold text-sm leading-none text-white">{brand.short_name || brand.name}</p>
            <p className="text-[10px] text-gray-500">Super Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto space-y-1">
          {NAV_GROUPS.map((g) => (
            <NavGroup key={g.label} group={g} onClose={() => setMobileOpen(false)} />
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/5 shrink-0 space-y-1">
          <p className="text-[11px] text-gray-600 px-3 truncate">{user?.email}</p>
          <Button
            variant="ghost"
            onClick={() => { logout(); navigate("/themazuki/master"); }}
            className="w-full justify-start text-gray-400 hover:text-red-400 hover:bg-white/5 text-sm"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <div className="lg:hidden h-14 min-h-14 bg-[#111111] border-b border-white/5 flex items-center px-4 gap-3">
          <button onClick={() => setMobileOpen(true)} className="min-h-11 min-w-11 -ml-2 grid place-items-center text-gray-400">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm text-white">Super Admin</span>
        </div>
        <main className="admin-content flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">
          <div className="w-full min-w-0 max-w-full"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
