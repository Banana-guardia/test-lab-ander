import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "soul_antigravity_theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  // Sincronizar con el DOM (html.dark) y localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Escuchar cambios en la preferencia del sistema operativo si el usuario no ha fijado uno manual
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const isDark = theme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
        title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
        className="h-9 px-3 rounded-lg inline-flex items-center gap-2 border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-xs font-medium"
      >
        {isDark ? (
          <>
            <Sun className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Claro</span>
          </>
        ) : (
          <>
            <Moon className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Oscuro</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggleTheme}
      title={isDark ? "Modo Oscuro activo — Haz clic para Modo Claro" : "Modo Claro activo — Haz clic para Modo Oscuro"}
      className="group w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 hover:bg-slate-100/80 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
            isDark
              ? "bg-indigo-500/15 text-indigo-400"
              : "bg-amber-500/15 text-amber-600"
          }`}
        >
          {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </div>
        <div className="text-left">
          <span className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 leading-tight">
            {isDark ? "Modo Oscuro" : "Modo Claro"}
          </span>
          <span className="block text-[10px] text-slate-500 dark:text-zinc-400">
            {isDark ? "Bajo contraste (Zinc)" : "Descanso visual (Slate)"}
          </span>
        </div>
      </div>

      {/* Píldora del Switch */}
      <div
        className={`w-10 h-5 rounded-full p-0.5 flex items-center transition-colors ${
          isDark ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform flex items-center justify-center ${
            isDark ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {isDark ? (
            <Moon className="w-2.5 h-2.5 text-indigo-600" />
          ) : (
            <Sun className="w-2.5 h-2.5 text-amber-500" />
          )}
        </div>
      </div>
    </button>
  );
}

export default ThemeToggle;
