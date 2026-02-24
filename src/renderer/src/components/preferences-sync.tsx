import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { useScale } from '@/providers/scale-provider';
import { syncFromServer, resetSync, getLocalPreferences } from '@/lib/preferences-sync';
import { setCachedDefaultProjectId } from '@/providers/data-provider';
import { apiFetch } from '@/lib/api';
import type { ThemeId } from '@/lib/themes';

export function PreferencesSync() {
  const { environment, environmentConfig } = useAuth();
  const { setTheme } = useTheme();
  const { setScale } = useScale();
  const didInitialSync = useRef(false);

  const runSync = useCallback(() => {
    const fetchFn = (path: string, options?: { method?: string; body?: unknown }) =>
      apiFetch(environmentConfig.apiBaseUrl, environment, path, options);

    const before = getLocalPreferences();

    syncFromServer(fetchFn).then((prefs) => {
      if (prefs.theme !== before.theme) {
        setTheme(prefs.theme as ThemeId);
      }
      if (prefs.scale !== before.scale) {
        setScale(prefs.scale);
      }
      if (prefs.confirmTimerSwitch !== before.confirmTimerSwitch) {
        window.dispatchEvent(
          new CustomEvent('confirm-timer-switch-changed', { detail: prefs.confirmTimerSwitch }),
        );
      }
      if (prefs.defaultProjectId !== before.defaultProjectId) {
        window.electronAPI?.setDefaultProject(prefs.defaultProjectId);
        setCachedDefaultProjectId(prefs.defaultProjectId);
        window.dispatchEvent(
          new CustomEvent('default-project-changed', { detail: prefs.defaultProjectId }),
        );
      }
    });
  }, [environment, environmentConfig.apiBaseUrl, setTheme, setScale]);

  // Initial sync on mount
  useEffect(() => {
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    runSync();

    return () => {
      resetSync();
      didInitialSync.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync when settings panel opens
  useEffect(() => {
    const handler = () => runSync();
    window.addEventListener('settings-opened', handler);
    return () => window.removeEventListener('settings-opened', handler);
  }, [runSync]);

  return null;
}
