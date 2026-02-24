import { Settings } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { HourglassLogo } from './hourglass-logo';

export function PopupHeader({ onSettingsClick }: { onSettingsClick: () => void }) {
  return (
    <div style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div
        className="flex items-center justify-between border-b border-border"
        style={{ padding: `${scaled(12)} ${scaled(16)}` }}
      >
        <div
          className="flex items-center font-brand font-semibold uppercase tracking-widest text-primary"
          style={{ fontSize: scaled(11), letterSpacing: '3px', gap: scaled(6) }}
        >
          <HourglassLogo size={14} />
          TERNITY
          <span
            className="font-brand font-normal normal-case tracking-normal text-muted-foreground"
            style={{ fontSize: scaled(9), letterSpacing: '1px' }}
          >
            Electron
          </span>
        </div>
        <button
          className="flex items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          style={{ width: scaled(24), height: scaled(24), WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={onSettingsClick}
        >
          <Settings style={{ width: scaled(14), height: scaled(14) }} />
        </button>
      </div>
    </div>
  );
}
