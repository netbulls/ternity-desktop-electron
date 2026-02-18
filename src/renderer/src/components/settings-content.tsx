import { useState, useEffect } from 'react';
import { Keyboard, X, LogOut } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { THEMES, type ThemeId } from '@/lib/themes';
import { SCALES, useScale } from '@/providers/scale-provider';
import { useTheme } from '@/providers/theme-provider';
import { LAYOUTS, useLayout, type LayoutId } from '@/providers/layout-provider';
import { useAuth } from '@/providers/auth-provider';
import { useOptionalData } from '@/providers/data-provider';

export function SettingsContent({
  onClose,
}: {
  onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const { scale, setScale } = useScale();
  const { layout, setLayout } = useLayout();
  const { environmentConfig, user, signOut } = useAuth();
  const data = useOptionalData();
  const [startAtLogin, setStartAtLogin] = useState(false);

  useEffect(() => {
    window.electronAPI?.getLoginItem().then(setStartAtLogin);
  }, []);

  const toggleStartAtLogin = () => {
    const next = !startAtLogin;
    setStartAtLogin(next);
    window.electronAPI?.setLoginItem(next);
  };

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
            onChange={(e) => setTheme(e.target.value as ThemeId)}
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
            onChange={(e) => setScale(Number(e.target.value))}
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
          className="flex cursor-pointer items-center justify-between"
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
      </div>

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
    </div>
  );
}
