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

export type TimerStyleId = 'default' | 'liquid-glass-wide';

export interface TimerStyleOption {
  id: TimerStyleId;
  name: string;
}

export const TIMER_STYLES: TimerStyleOption[] = [
  { id: 'default', name: 'Default' },
  { id: 'liquid-glass-wide', name: 'Liquid Glass Wide' },
];

const DEFAULT_TIMER_STYLE: TimerStyleId = 'default';

interface LayoutContextValue {
  layout: LayoutId;
  setLayout: (layout: LayoutId) => void;
  timerStyle: TimerStyleId;
  setTimerStyle: (style: TimerStyleId) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<LayoutId>(() => {
    const stored = localStorage.getItem('ternity-layout') as LayoutId | null;
    return stored && LAYOUTS.some((l) => l.id === stored) ? stored : DEFAULT_LAYOUT;
  });

  const [timerStyle, setTimerStyleState] = useState<TimerStyleId>(() => {
    const stored = localStorage.getItem('ternity-timer-style') as TimerStyleId | null;
    return stored && TIMER_STYLES.some((s) => s.id === stored) ? stored : DEFAULT_TIMER_STYLE;
  });

  const setLayout = (newLayout: LayoutId) => {
    setLayoutState(newLayout);
    localStorage.setItem('ternity-layout', newLayout);
  };

  const setTimerStyle = (newStyle: TimerStyleId) => {
    setTimerStyleState(newStyle);
    localStorage.setItem('ternity-timer-style', newStyle);
  };

  return (
    <LayoutContext.Provider value={{ layout, setLayout, timerStyle, setTimerStyle }}>{children}</LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}
