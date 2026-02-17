import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const SCALES = [
  { label: 'Compact', value: 0.9 },
  { label: 'Default', value: 1.1 },
  { label: 'Comfortable', value: 1.2 },
] as const;

export type ScaleMeta = (typeof SCALES)[number];

const DEFAULT_SCALE = 1.1;
const STORAGE_KEY = 'ternity-scale';

interface ScaleContextValue {
  scale: number;
  scaleMeta: ScaleMeta;
  setScale: (value: number) => void;
}

const ScaleContext = createContext<ScaleContextValue | null>(null);

export function ScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (SCALES.some((s) => s.value === parsed)) return parsed;
    }
    return DEFAULT_SCALE;
  });

  const scaleMeta = SCALES.find((s) => s.value === scale) ?? SCALES[1]!;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(scale));
    document.documentElement.style.setProperty('--t-scale', String(scale));
  }, [scale]);

  const setScale = (value: number) => {
    setScaleState(value);
  };

  return (
    <ScaleContext.Provider value={{ scale, scaleMeta, setScale }}>{children}</ScaleContext.Provider>
  );
}

export function useScale() {
  const ctx = useContext(ScaleContext);
  if (!ctx) throw new Error('useScale must be used within ScaleProvider');
  return ctx;
}
