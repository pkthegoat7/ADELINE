'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '@/lib/theme';
import { useAppearanceSync } from '@/lib/appearance';
import { api } from '@/lib/api';
import { readMeCache, writeMeCache, type MeSnapshot } from '@/lib/me-cache';

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
    queryFn: () => api<MeSnapshot>('/me'),
    enabled: typeof window !== 'undefined',
    // Semeia com o snapshot persistido p/ a sidebar (papel/super-admin) aparecer
    // na hora na recarga; updatedAt 0 força refetch em segundo plano p/ corrigir.
    initialData: readMeCache,
    initialDataUpdatedAt: 0,
  });
  // Persiste o /me a cada atualização para a próxima recarga renderizar instantânea.
  useEffect(() => {
    writeMeCache(data);
  }, [data]);
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
