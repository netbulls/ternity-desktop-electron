export const THEME_IDS = [
  'ternity-dark',
  'ternity-light',
  'midnight',
  'warm-sand',
  'carbon',
  'high-contrast',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'ternity-dark';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  type: 'dark' | 'light';
  badge: string | null;
}

export const THEMES: ThemeMeta[] = [
  { id: 'ternity-dark', name: 'Ternity Dark', type: 'dark', badge: 'default' },
  { id: 'ternity-light', name: 'Ternity Light', type: 'light', badge: 'essential' },
  { id: 'midnight', name: 'Midnight', type: 'dark', badge: null },
  { id: 'warm-sand', name: 'Warm Sand', type: 'light', badge: null },
  { id: 'carbon', name: 'Carbon', type: 'dark', badge: null },
  { id: 'high-contrast', name: 'High Contrast', type: 'dark', badge: 'a11y' },
];
