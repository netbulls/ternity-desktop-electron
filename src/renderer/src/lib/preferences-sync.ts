import type { UserPreferences } from './api-types';

const STORAGE_KEY = 'ternity-preferences';

const DEFAULTS: UserPreferences = {
  theme: 'ternity-dark',
  scale: 1.1,
  confirmTimerSwitch: true,
  defaultProjectId: null,
};

// Module-level state
let hasSynced = false;
let pendingPatch: Partial<UserPreferences> = {};
let patchTimer: ReturnType<typeof setTimeout> | null = null;
let apiFetchRef: ((path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>) | null = null;

export function getLocalPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // Corrupted localStorage — fall back to defaults
  }
  return { ...DEFAULTS };
}

export function setLocalPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): void {
  const prefs = getLocalPreferences();
  prefs[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getConfirmTimerSwitch(): boolean {
  return getLocalPreferences().confirmTimerSwitch;
}

export function setConfirmTimerSwitch(value: boolean): void {
  setLocalPreference('confirmTimerSwitch', value);
  schedulePatch({ confirmTimerSwitch: value });
}

export async function syncFromServer(
  fetchFn: (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>,
): Promise<UserPreferences> {
  apiFetchRef = fetchFn;
  try {
    const serverPrefs = (await fetchFn('/api/user/preferences')) as Partial<UserPreferences>;
    const merged = { ...DEFAULTS, ...serverPrefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    hasSynced = true;
    return merged;
  } catch (err) {
    console.warn('[preferences-sync] Failed to fetch preferences from server:', err);
    hasSynced = true; // Still allow patches — server just couldn't be read
    return getLocalPreferences();
  }
}

export function schedulePatch(changedFields: Partial<UserPreferences>): void {
  if (!hasSynced || !apiFetchRef) return;

  pendingPatch = { ...pendingPatch, ...changedFields };

  if (patchTimer) clearTimeout(patchTimer);
  patchTimer = setTimeout(() => {
    const payload = { ...pendingPatch };
    pendingPatch = {};
    patchTimer = null;

    apiFetchRef?.('/api/user/preferences', {
      method: 'PATCH',
      body: payload,
    }).catch((err) => {
      console.warn('[preferences-sync] Failed to patch preferences:', err);
    });
  }, 300);
}

export function resetSync(): void {
  hasSynced = false;
  pendingPatch = {};
  if (patchTimer) {
    clearTimeout(patchTimer);
    patchTimer = null;
  }
  apiFetchRef = null;
}
