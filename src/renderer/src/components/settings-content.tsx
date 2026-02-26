import { useState, useEffect, useRef } from 'react';
import { Keyboard, X, LogOut, ChevronDown, FolderKanban } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { scaled } from '@/lib/scaled';
import { THEMES, type ThemeId } from '@/lib/themes';
import { SCALES, useScale } from '@/providers/scale-provider';
import { useTheme } from '@/providers/theme-provider';
import { LAYOUTS, TIMER_STYLES, useLayout, type LayoutId, type TimerStyleId } from '@/providers/layout-provider';
import { useAuth } from '@/providers/auth-provider';
import { useOptionalData, getCachedProjects, getCachedDefaultProjectId, setCachedDefaultProjectId } from '@/providers/data-provider';
import { ProjectPicker } from './project-picker';
import type { ProjectOption } from '@/lib/api-types';
import { getConfirmTimerSwitch, setConfirmTimerSwitch, schedulePatch, getLocalPreferences } from '@/lib/preferences-sync';

export function SettingsContent({
  onClose,
}: {
  onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const { scale, setScale } = useScale();
  const { layout, setLayout, timerStyle, setTimerStyle } = useLayout();
  const { environment, environmentConfig, user, signOut } = useAuth();
  const data = useOptionalData();
  const [startAtLogin, setStartAtLogin] = useState(false);
  const [rememberPosition, setRememberPosition] = useState(false);
  const [stayOnTop, setStayOnTopState] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(
    () => getLocalPreferences().defaultProjectId ?? getCachedDefaultProjectId(),
  );
  const [projects, setProjects] = useState<ProjectOption[]>(getCachedProjects);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(getConfirmTimerSwitch);
  const [pillPop, setPillPop] = useState(false);
  const projectTriggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    window.electronAPI?.getLoginItem().then(setStartAtLogin);
    window.electronAPI?.getRememberPosition().then(setRememberPosition);
    window.electronAPI?.getStayOnTop().then(setStayOnTopState);
    window.dispatchEvent(new Event('settings-opened'));
  }, []);

  // Sync confirmTimerSwitch when changed externally (e.g. "Don't ask again" in overlay, or server sync)
  useEffect(() => {
    const handler = (e: Event) => {
      setConfirmSwitch((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('confirm-timer-switch-changed', handler);
    return () => window.removeEventListener('confirm-timer-switch-changed', handler);
  }, []);

  // Sync defaultProjectId when changed externally (e.g. server sync on settings open)
  useEffect(() => {
    const handler = (e: Event) => {
      setDefaultProjectId((e as CustomEvent<string | null>).detail);
    };
    window.addEventListener('default-project-changed', handler);
    return () => window.removeEventListener('default-project-changed', handler);
  }, []);

  const toggleStartAtLogin = () => {
    const next = !startAtLogin;
    setStartAtLogin(next);
    window.electronAPI?.setLoginItem(next);
  };

  const toggleRememberPosition = () => {
    const next = !rememberPosition;
    setRememberPosition(next);
    window.electronAPI?.setRememberPosition(next);
  };

  const toggleStayOnTop = () => {
    const next = !stayOnTop;
    setStayOnTopState(next);
    window.electronAPI?.setStayOnTop(next);
  };

  const toggleConfirmSwitch = () => {
    const next = !confirmSwitch;
    setConfirmSwitch(next);
    setConfirmTimerSwitch(next);
  };

  const handleDefaultProjectSelect = (project: ProjectOption | null) => {
    const id = project?.id ?? null;
    setDefaultProjectId(id);
    setCachedDefaultProjectId(id);
    window.electronAPI?.setDefaultProject(id);
    schedulePatch({ defaultProjectId: id });
    window.dispatchEvent(
      new CustomEvent('default-project-changed', { detail: project?.id ?? null }),
    );
    setPickerOpen(false);
    setPillPop(true);
    setTimeout(() => setPillPop(false), 500);
  };

  const selectedDefaultProject = projects.find((p) => p.id === defaultProjectId) ?? null;

  return (
    <div style={{ padding: scaled(16) }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center" style={{ gap: scaled(6) }}>
          <span
            className="font-brand font-semibold uppercase tracking-widest text-foreground"
            style={{ fontSize: scaled(10), letterSpacing: '2px' }}
          >
            Settings
          </span>
          <span
            className="rounded border border-primary/30 bg-primary/8 px-1.5 py-0.5 font-mono text-primary"
            style={{ fontSize: scaled(8) }}
          >
            {environmentConfig.label}
          </span>
        </div>
        <button
          className="flex items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          style={{ width: scaled(24), height: scaled(24) }}
          onClick={onClose}
        >
          <X style={{ width: scaled(14), height: scaled(14) }} />
        </button>
      </div>

      {/* Appearance — compact rows */}
      <div
        className="mb-3 rounded-md border border-border bg-card"
        style={{ fontSize: scaled(10) }}
      >
        {/* Theme */}
        <div
          className="flex items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
        >
          <span className="text-muted-foreground">Theme</span>
          <select
            className="cursor-pointer rounded-md border-none bg-transparent text-right text-foreground outline-none"
            style={{ fontSize: scaled(10), padding: `${scaled(2)} 0` }}
            value={theme}
            onChange={(e) => {
              const v = e.target.value as ThemeId;
              setTheme(v);
              schedulePatch({ theme: v });
            }}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id} className="bg-card text-foreground">
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Layout */}
        <div
          className="flex items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
        >
          <span className="text-muted-foreground">Layout</span>
          <select
            className="cursor-pointer rounded-md border-none bg-transparent text-right text-foreground outline-none"
            style={{ fontSize: scaled(10), padding: `${scaled(2)} 0` }}
            value={layout}
            onChange={(e) => setLayout(e.target.value as LayoutId)}
          >
            {LAYOUTS.map((l) => (
              <option key={l.id} value={l.id} className="bg-card text-foreground">
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Timer */}
        <div
          className="flex items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
        >
          <span className="text-muted-foreground">Timer</span>
          <select
            className="rounded-md border-none bg-transparent text-right outline-none disabled:cursor-default disabled:opacity-40"
            style={{ fontSize: scaled(10), padding: `${scaled(2)} 0` }}
            value={layout === 'liquid-glass' ? timerStyle : 'default'}
            onChange={(e) => setTimerStyle(e.target.value as TimerStyleId)}
            disabled={layout !== 'liquid-glass'}
          >
            {TIMER_STYLES.map((s) => (
              <option key={s.id} value={s.id} className="bg-card text-foreground">
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Scale */}
        <div
          className="flex items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
        >
          <span className="text-muted-foreground">Scale</span>
          <select
            className="cursor-pointer rounded-md border-none bg-transparent text-right text-foreground outline-none"
            style={{ fontSize: scaled(10), padding: `${scaled(2)} 0` }}
            value={scale}
            onChange={(e) => {
              const v = Number(e.target.value);
              setScale(v);
              schedulePatch({ scale: v });
            }}
          >
            {SCALES.map((s) => (
              <option key={s.label} value={s.value} className="bg-card text-foreground">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Start at Login */}
        <div
          className="flex cursor-pointer items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
          onClick={toggleStartAtLogin}
        >
          <span className="text-muted-foreground">Start at Login</span>
          <span
            className={`rounded-full transition-colors ${
              startAtLogin ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            style={{ width: scaled(28), height: scaled(16), position: 'relative' }}
          >
            <span
              className="absolute rounded-full bg-white transition-all"
              style={{
                width: scaled(12),
                height: scaled(12),
                top: scaled(2),
                left: startAtLogin ? scaled(14) : scaled(2),
              }}
            />
          </span>
        </div>

        {/* Remember Position */}
        <div
          className="flex cursor-pointer items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
          onClick={toggleRememberPosition}
        >
          <span className="text-muted-foreground">Remember Position</span>
          <span
            className={`rounded-full transition-colors ${
              rememberPosition ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            style={{ width: scaled(28), height: scaled(16), position: 'relative' }}
          >
            <span
              className="absolute rounded-full bg-white transition-all"
              style={{
                width: scaled(12),
                height: scaled(12),
                top: scaled(2),
                left: rememberPosition ? scaled(14) : scaled(2),
              }}
            />
          </span>
        </div>

        {/* Stay on Top */}
        <div
          className="flex cursor-pointer items-center justify-between border-b border-border/50"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
          onClick={toggleStayOnTop}
        >
          <span className="text-muted-foreground">Stay on Top</span>
          <span
            className={`rounded-full transition-colors ${
              stayOnTop ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            style={{ width: scaled(28), height: scaled(16), position: 'relative' }}
          >
            <span
              className="absolute rounded-full bg-white transition-all"
              style={{
                width: scaled(12),
                height: scaled(12),
                top: scaled(2),
                left: stayOnTop ? scaled(14) : scaled(2),
              }}
            />
          </span>
        </div>

        {/* Confirm Timer Switch */}
        <div
          className="flex cursor-pointer items-center justify-between"
          style={{ padding: `${scaled(7)} ${scaled(10)}` }}
          onClick={toggleConfirmSwitch}
        >
          <span className="text-muted-foreground">Confirm Timer Switch</span>
          <span
            className={`rounded-full transition-colors ${
              confirmSwitch ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            style={{ width: scaled(28), height: scaled(16), position: 'relative' }}
          >
            <span
              className="absolute rounded-full bg-white transition-all"
              style={{
                width: scaled(12),
                height: scaled(12),
                top: scaled(2),
                left: confirmSwitch ? scaled(14) : scaled(2),
              }}
            />
          </span>
        </div>
      </div>

      {/* Preferences */}
      {projects.length > 0 && (
        <div
          className="mb-3 rounded-md border border-border bg-card"
          style={{ fontSize: scaled(10) }}
        >
          <div
            className="relative flex items-center justify-between"
            style={{ padding: `${scaled(7)} ${scaled(10)}` }}
          >
            <span className="text-muted-foreground">Default Project</span>
            <motion.span
              ref={projectTriggerRef}
              className={`flex cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground ${pillPop ? 'pill-pop' : ''}`}
              style={{
                gap: scaled(4),
                fontSize: scaled(10),
                border: '1px solid',
                borderRadius: scaled(10),
                padding: `${scaled(1)} ${scaled(6)}`,
                margin: `${scaled(-1)} ${scaled(-6)}`,
              }}
              animate={pickerOpen
                ? {
                    borderColor: [
                      'hsl(var(--primary) / 0.3)',
                      'hsl(var(--primary) / 0.6)',
                      'hsl(var(--primary) / 0.3)',
                    ],
                  }
                : { borderColor: 'transparent' }
              }
              transition={pickerOpen
                ? { duration: 2, repeat: Infinity, ease: 'easeInOut' as const }
                : { duration: 0.2 }
              }
              onClick={() => {
                if (projectTriggerRef.current) {
                  const rect = projectTriggerRef.current.getBoundingClientRect();
                  setPickerAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
                }
                setPickerOpen((o) => !o);
              }}
            >
              {selectedDefaultProject ? (
                <>
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: scaled(6),
                      height: scaled(6),
                      background: selectedDefaultProject.color ?? 'hsl(var(--primary))',
                    }}
                  />
                  <span className="truncate" style={{ maxWidth: scaled(90) }}>
                    {selectedDefaultProject.name}
                  </span>
                </>
              ) : (
                <>
                  <FolderKanban style={{ width: scaled(10), height: scaled(10) }} />
                  <span>None</span>
                </>
              )}
              <ChevronDown
                style={{
                  width: scaled(9),
                  height: scaled(9),
                  opacity: 0.5,
                  transition: 'transform 0.15s',
                  transform: pickerOpen ? 'rotate(180deg)' : 'rotate(0)',
                }}
              />
            </motion.span>
            <AnimatePresence>
              {pickerOpen && (
                <ProjectPicker
                  selected={selectedDefaultProject}
                  onSelect={handleDefaultProjectSelect}
                  onClose={() => setPickerOpen(false)}
                  projects={projects}
                  align="right"
                  anchorRect={pickerAnchor ?? undefined}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div>
        <span
          className="mb-2 flex items-center font-brand uppercase tracking-wider text-muted-foreground"
          style={{ fontSize: scaled(8), letterSpacing: '1.5px', gap: scaled(4) }}
        >
          <Keyboard style={{ width: scaled(10), height: scaled(10) }} />
          Shortcuts
        </span>
        <div
          className="rounded-md border border-border bg-card"
          style={{ padding: `${scaled(8)} ${scaled(10)}` }}
        >
          {[
            ['Start / Stop', '⌘ + Shift + T'],
            ['Open Popup', '⌘ + Shift + P'],
            ['Open Web App', '⌘ + Shift + W'],
          ].map(([action, key]) => (
            <div
              key={action}
              className="flex items-center justify-between text-muted-foreground"
              style={{ fontSize: scaled(10), padding: `${scaled(3)} 0` }}
            >
              <span>{action}</span>
              <kbd
                className="rounded border border-border bg-muted/50 font-mono"
                style={{ padding: `${scaled(1)} ${scaled(6)}`, fontSize: scaled(9) }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* User + Sign out */}
      <div
        className="mt-4 flex items-center border-t border-border"
        style={{ paddingTop: scaled(10), gap: scaled(8) }}
      >
        {user && (
          <div
            className="min-w-0 flex-1 truncate text-muted-foreground"
            style={{ fontSize: scaled(9) }}
          >
            {data?.userProfile?.displayName ?? user.name ?? user.email ?? user.sub}
          </div>
        )}
        <button
          className="flex shrink-0 items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/8 hover:text-red-400"
          style={{ gap: scaled(4), padding: `${scaled(5)} ${scaled(8)}`, fontSize: scaled(10) }}
          onClick={signOut}
        >
          <LogOut style={{ width: scaled(12), height: scaled(12) }} />
          Sign out
        </button>
      </div>

      {/* View Logs */}
      <div className="mt-2 text-center">
        <button
          className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          style={{ fontSize: scaled(8) }}
          onClick={() => window.electronAPI?.openLogs()}
        >
          View Logs
        </button>
      </div>

      {/* Platform badge */}
      <div
        className="mt-3 flex items-center justify-center"
        style={{ gap: scaled(6) }}
      >
        <span
          className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-primary/60"
          style={{ fontSize: scaled(7) }}
        >
          Electron
        </span>
        <span
          className="text-muted-foreground/30 font-mono"
          style={{ fontSize: scaled(7) }}
        >
          {__APP_VERSION__}
        </span>
      </div>
    </div>
  );
}
