'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '@/lib/theme';
import { useAppearanceSync } from '@/lib/appearance';
import { api } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AppearanceBridge>{children}</AppearanceBridge>
    </QueryClientProvider>
  );
}

function AppearanceBridge({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // Carrega tenant.appearance do /me e aplica no <html>. O cache local já foi
  // aplicado no script inline em layout.tsx — isso aqui é só pra sincronizar
  // com o que está salvo no banco quando o usuário muda de máquina/navegador.
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ tenant?: { appearance?: unknown } }>('/me'),
    enabled: typeof window !== 'undefined',
  });
  useAppearanceSync(data?.tenant?.appearance);

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        theme={theme}
        toastOptions={{
          style: {
            fontFamily: 'var(--font-inter), system-ui',
            borderRadius: 'var(--radius-control, 10px)',
          },
        }}
      />
    </>
  );
}
