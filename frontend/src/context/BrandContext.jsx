import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { fileUrl } from "@/lib/api";

export const DEFAULT_BRAND = {
  name: "Dino Menu",
  short_name: "Dino Menu",
  tagline: "Cardapio digital",
  description: "Cardapio digital e delivery online.",
  logo_url: "",
  icon_url: "",
  primary_color: "#e30613",
  secondary_color: "#97000a",
  accent_color: "#ffffff",
  login_accent_color: "",
  login_kicker: "Sua operacao em campo",
  login_title: "Venda com raca. Gerencie com controle.",
  login_subtitle: "Cardapio, pedidos, caixa e clientes em uma plataforma feita para o ritmo do seu restaurante.",
  login_template: "sport",
  powered_by_enabled: true,
};

const BrandContext = createContext({
  brand: DEFAULT_BRAND,
  loading: true,
  refreshBrand: () => Promise.resolve(),
});

function setMeta(name, content, attr = "name") {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function applyBrandToDocument(brand) {
  document.documentElement.style.setProperty("--brand-primary", brand.primary_color);
  document.documentElement.style.setProperty("--brand-primary-foreground", brand.accent_color || "#ffffff");
  document.documentElement.style.setProperty("--brand-secondary", `${brand.primary_color}24`);
  document.title = brand.name || DEFAULT_BRAND.name;
  setMeta("description", brand.description);
  setMeta("og:title", brand.name, "property");
  setMeta("og:site_name", brand.name, "property");
  setMeta("twitter:title", brand.name);
  setMeta("twitter:description", brand.description);
}

export function BrandProvider({ children }) {
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);

  const refreshBrand = async () => {
    try {
      const { data } = await api.get("/public/platform-config");
      const next = { ...DEFAULT_BRAND, ...(data?.brand || {}) };
      next.logo_url = fileUrl(next.logo_url) || "";
      next.icon_url = fileUrl(next.icon_url) || "";
      setBrand(next);
      applyBrandToDocument(next);
      return next;
    } catch {
      applyBrandToDocument(DEFAULT_BRAND);
      return DEFAULT_BRAND;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBrand();
  }, []);

  const value = useMemo(() => ({ brand, loading, refreshBrand }), [brand, loading]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
