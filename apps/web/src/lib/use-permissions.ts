'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { can, type Capability } from './permissions';

/**
 * Hook que devolve `can(capability)` baseado no papel do usuário logado.
 * Reusa o cache da query ['me'] já carregada no layout do dashboard.
 */
export function useCan(): (capability: Capability) => boolean {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { role?: string } }>('/me'),
  });
  const role = data?.user?.role;
  return (capability: Capability) => can(role, capability);
}
