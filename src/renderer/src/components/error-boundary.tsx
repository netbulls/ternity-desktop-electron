import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { scaled } from '@/lib/scaled';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  private handleReload = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ gap: scaled(12), padding: `0 ${scaled(24)}` }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: scaled(36),
            height: scaled(36),
            background: 'hsl(var(--destructive) / 0.12)',
          }}
        >
          <AlertTriangle
            style={{ width: scaled(18), height: scaled(18) }}
            className="text-destructive"
          />
        </div>
        <p className="text-foreground" style={{ fontSize: scaled(13) }}>
          Something went wrong
        </p>
        <p
          className="max-w-full truncate text-muted-foreground"
          style={{ fontSize: scaled(10) }}
          title={this.state.error.message}
        >
          {this.state.error.message}
        </p>
        <button
          onClick={this.handleReload}
          className="mt-1 flex items-center rounded-md bg-primary/10 text-primary transition-colors hover:bg-primary/20"
          style={{
            gap: scaled(6),
            padding: `${scaled(6)} ${scaled(14)}`,
            fontSize: scaled(11),
          }}
        >
          <RotateCcw style={{ width: scaled(12), height: scaled(12) }} />
          Retry
        </button>
      </div>
    );
  }
}
