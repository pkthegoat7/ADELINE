/**
 * Espelho da matriz de permissões da API (`apps/api/src/common/permissions.ts`).
 * Usado só para esconder/desabilitar ações na UI — a autorização REAL é no
 * servidor (CapabilityGuard). Ao mudar uma regra, atualize os DOIS lados.
 */

export type Capability =
  | 'reservation:write'
  | 'reservation:cancel'
  | 'reservation:delete'
  | 'reservation:checkin'
  | 'guest:write'
  | 'guest:delete'
  | 'room:manage'
  | 'room:status'
  | 'calendar:block'
  | 'channel:manage'
  | 'property:manage'
  | 'settings:manage'
  | 'payment:link'
  | 'team:manage'
  | 'expense:read'
  | 'expense:manage'
  | 'owner:read'
  | 'owner:manage'
  | 'payout:read'
  | 'payout:manage'
  | 'subscription:manage';

const CAPABILITY_ROLES: Record<Capability, readonly string[]> = {
  'reservation:write': ['owner', 'manager', 'receptionist'],
  'reservation:cancel': ['owner', 'manager', 'receptionist'],
  'reservation:delete': ['owner', 'manager'],
  'reservation:checkin': ['owner', 'manager', 'receptionist', 'housekeeper'],
  'guest:write': ['owner', 'manager', 'receptionist'],
  'guest:delete': ['owner', 'manager'],
  'room:manage': ['owner', 'manager'],
  'room:status': ['owner', 'manager', 'receptionist', 'housekeeper'],
  'calendar:block': ['owner', 'manager', 'receptionist'],
  'channel:manage': ['owner', 'manager'],
  'property:manage': ['owner', 'manager'],
  'settings:manage': ['owner', 'manager'],
  'payment:link': ['owner', 'manager', 'receptionist'],
  'team:manage': ['owner', 'manager'],
  'expense:read': ['owner', 'manager'],
  'expense:manage': ['owner', 'manager'],
  'owner:read': ['owner', 'manager'],
  'owner:manage': ['owner', 'manager'],
  'payout:read': ['owner', 'manager'],
  'payout:manage': ['owner', 'manager'],
  'subscription:manage': ['owner'],
};

export function can(role: string | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITY_ROLES[capability].includes(role);
}
