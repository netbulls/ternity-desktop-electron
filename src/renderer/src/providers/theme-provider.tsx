import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEMES, DEFAULT_THEME, type ThemeId, type ThemeMeta } from '@/lib/themes';

interface ThemeContextValue {
  theme: ThemeId;
  themeMeta: ThemeMeta;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem('ternity-theme') as ThemeId | null;
    return stored && THEMES.some((t) => t.id === stored) ? stored : DEFAULT_THEME;
  });

  const themeMeta = THEMES.find((t) => t.id === theme) ?? THEMES[0]!;

  useEffect(() => {
    localStorage.setItem('ternity-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', themeMeta.type === 'dark');
  }, [theme, themeMeta]);

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeMeta, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
