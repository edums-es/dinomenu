import { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext({ dark: true, toggle: () => {} });

export function ThemeProvider({ children }) {
  useEffect(() => {
    // Always dark — no toggle
    document.documentElement.classList.add("dark");
  }, []);
  return (
    <ThemeContext.Provider value={{ dark: true, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Forces light mode for public pages (cardápio, rastreamento).
 * The public cardápio has its own built-in dark theme — it does NOT
 * use the Tailwind dark class; its background is hardcoded dark.
 * We just need to remove the Tailwind dark class so shadcn vars reset.
 */
export function ForceLightMode({ children }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => document.documentElement.classList.add("dark");
  }, []);
  return children;
}
