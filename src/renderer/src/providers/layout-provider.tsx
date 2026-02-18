import { createContext, useContext, useState, type ReactNode } from 'react';

export type LayoutId = 'liquid-glass' | 'layered' | 'hero';

export interface LayoutOption {
  id: LayoutId;
  name: string;
}

export const LAYOUTS: LayoutOption[] = [
  { id: 'liquid-glass', name: 'Liquid Glass' },
  { id: 'layered', name: 'Layered' },
  { id: 'hero', name: 'Hero' },
];

const DEFAULT_LAYOUT: LayoutId = 'liquid-glass';

interface LayoutContextValue {
  layout: LayoutId;
  setLayout: (layout: LayoutId) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<LayoutId>(() => {
    const stored = localStorage.getItem('ternity-layout') as LayoutId | null;
    return stored && LAYOUTS.some((l) => l.id === stored) ? stored : DEFAULT_LAYOUT;
  });

  const setLayout = (newLayout: LayoutId) => {
    setLayoutState(newLayout);
    localStorage.setItem('ternity-layout', newLayout);
  };

  return (
    <LayoutContext.Provider value={{ layout, setLayout }}>{children}</LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}
