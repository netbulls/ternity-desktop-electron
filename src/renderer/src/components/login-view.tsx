import { motion } from 'motion/react';
import { LogIn, RotateCw } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import { ENVIRONMENT_LIST, type EnvironmentId } from '@/lib/environments';
import { useAuth } from '@/providers/auth-provider';
import { HourglassLogo } from './hourglass-logo';

export function LoginView() {
  const { environment, setEnvironment, signIn, signInDemo, isSigningIn, signInProgress, cancelSignIn } = useAuth();

  return (
    <div
      className="flex h-screen flex-col items-center text-center"
      style={{
        padding: `${scaled(24)} ${scaled(24)}`,
        WebkitAppRegion: 'drag',
        background: 'radial-gradient(ellipse at 30% 20%, hsl(168 50% 8%) 0%, hsl(var(--background)) 60%)',
      } as React.CSSProperties}
    >
      {/* Top section — card */}
      <div className="flex flex-1 flex-col items-center justify-center" style={{ width: '100%' }}>
        <motion.div
          className="relative flex w-full flex-col items-center overflow-hidden rounded-xl border"
          style={{
            padding: `${scaled(36)} ${scaled(28)} ${scaled(28)}`,
            background: 'hsl(var(--card))',
            borderColor: 'hsl(var(--primary) / 0.12)',
            boxShadow: '0 4px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset',
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Shimmer line */}
          <div
            className="absolute left-0 right-0 top-0"
            style={{
              height: 2,
              background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)',
              opacity: 0.6,
            }}
          />

          <div className="mb-4 text-primary">
            <HourglassLogo size={36} />
          </div>
          <div
            className="mb-1 font-brand font-semibold uppercase tracking-widest text-foreground"
            style={{ fontSize: scaled(14), letterSpacing: '5px' }}
          >
            TERNITY
          </div>
          <div className="text-muted-foreground" style={{ fontSize: scaled(10), marginBottom: scaled(24) }}>
            Time tracking for your team
          </div>

          {/* Sign-in / signing-in state */}
          {isSigningIn ? (
            <div className="flex w-full flex-col items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <div className="w-full" style={{ padding: `0 ${scaled(4)}` }}>
                <div
                  className="w-full overflow-hidden rounded-full bg-muted"
                  style={{ height: 3 }}
                >
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: '0%' }}
                    animate={{ width: `${(signInProgress?.progress ?? 0) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                  />
                </div>
                <div
                  className="mt-2 text-center text-muted-foreground"
                  style={{ fontSize: scaled(11) }}
                >
                  {signInProgress?.label ?? 'Starting...'}
                </div>
              </div>
              <button
                className="mt-3 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                style={{ fontSize: scaled(10) }}
                onClick={cancelSignIn}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <motion.button
                className="flex w-full items-center justify-center rounded-lg bg-primary py-2.5 font-medium text-primary-foreground"
                style={{
                  fontSize: scaled(12),
                  gap: scaled(8),
                  boxShadow: '0 2px 20px hsl(var(--primary) / 0.25)',
                }}
                whileHover={{ boxShadow: '0 4px 28px hsl(var(--primary) / 0.4)', y: -1 }}
                whileTap={{ scale: 0.97, y: 0 }}
                transition={{ duration: 0.18 }}
                onClick={signIn}
              >
                <LogIn style={{ width: scaled(14), height: scaled(14) }} />
                Sign in with browser
              </motion.button>

              <button
                className="mt-3 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                style={{ fontSize: scaled(10) }}
                onClick={signInDemo}
              >
                Continue as demo
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer — env pills + version + refresh */}
      <div className="flex w-full items-end" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex flex-1 flex-col items-center" style={{ gap: scaled(8) }}>
          <div className="flex items-center" style={{ gap: scaled(4) }}>
            {ENVIRONMENT_LIST.map((env) => {
              const active = environment === env.id;
              const colorClass =
                env.id === 'local'
                  ? active ? 'text-amber-500 bg-amber-500/8 border-amber-500/30' : 'text-muted-foreground/40 border-transparent hover:text-amber-500/60'
                  : env.id === 'dev'
                    ? active ? 'text-blue-400 bg-blue-400/8 border-blue-400/30' : 'text-muted-foreground/40 border-transparent hover:text-blue-400/60'
                    : active ? 'text-primary bg-primary/8 border-primary/30' : 'text-muted-foreground/40 border-transparent hover:text-primary/60';
              return (
                <button
                  key={env.id}
                  disabled={isSigningIn}
                  className={`rounded-full border font-mono font-semibold uppercase transition-colors ${colorClass} ${isSigningIn ? 'cursor-not-allowed' : ''}`}
                  style={{ fontSize: scaled(8), padding: `${scaled(2)} ${scaled(10)}` }}
                  onClick={() => setEnvironment(env.id as EnvironmentId)}
                >
                  {env.label}
                </button>
              );
            })}
          </div>
          <div className="text-muted-foreground/30" style={{ fontSize: scaled(8) }}>
            {__APP_VERSION__}
          </div>
        </div>
        <button
          className="text-muted-foreground/30 transition-colors hover:text-muted-foreground"
          style={{ padding: scaled(4) }}
          onClick={() => window.location.reload()}
          title="Refresh"
        >
          <RotateCw style={{ width: scaled(12), height: scaled(12) }} />
        </button>
      </div>
    </div>
  );
}
