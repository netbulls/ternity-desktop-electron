import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { ScaleProvider } from '@/providers/scale-provider';
import { TrayPopup } from '@/components/tray-popup';

export function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ScaleProvider>
          <TrayPopup />
        </ScaleProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
