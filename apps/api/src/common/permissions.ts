/**
 * Matriz de permissões por papel (RBAC).
 *
 * Fonte única da verdade: tanto o guard da API (`CapabilityGuard`) quanto a UI
 * (espelho em `apps/web/src/lib/permissions.ts`) seguem esta matriz. Ao mudar
 * uma regra, atualize os DOIS lados.
 */

export type Role = 'owner' | 'manager' | 'receptionist' | 'housekeeper' | 'readonly';

export type Capability =
  | 'reservation:write' // criar/editar reserva
  | 'reservation:cancel' // cancelar reserva
  | 'reservation:delete' // exclusão definitiva
  | 'reservation:checkin' // check-in / check-out (recepção)
  | 'guest:write' // criar/editar hóspede
  | 'guest:delete'
  | 'room:manage' // inventário de quartos / tipos
  | 'room:status' // status de limpeza/manutenção
  | 'calendar:block' // bloquear/liberar disponibilidade
  | 'channel:manage' // canais iCal/Airbnb/Booking
  | 'property:manage' // propriedades
  | 'settings:manage' // aparência, termos, whatsapp, templates
  | 'payment:link' // gerar link de pagamento
  | 'payment:record' // registrar recebimento manual (dinheiro/pix/cartão)
  | 'payment:account' // configurar a conta MP de recebimento da pousada (owner)
  | 'team:manage' // logins/permissões
  | 'expense:read' // ver despesas/financeiro
  | 'expense:manage' // criar/editar/excluir despesa
  | 'owner:read' // ver proprietários
  | 'owner:manage' // criar/editar/excluir proprietário e termos de administração
  | 'payout:read' // ver repasses
  | 'payout:manage' // marcar pago / reabrir / lançamentos avulsos
  | 'subscription:manage'; // ver/cancelar assinatura

/** Para cada capacidade, os papéis que a possuem. */
const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
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
  'payment:record': ['owner', 'manager', 'receptionist'],
  'payment:account': ['owner'],
  'team:manage': ['owner', 'manager'],
  'expense:read': ['owner', 'manager'],
  'expense:manage': ['owner', 'manager'],
  'owner:read': ['owner', 'manager'],
  'owner:manage': ['owner', 'manager'],
  'payout:read': ['owner', 'manager'],
  'payout:manage': ['owner', 'manager'],
  'subscription:manage': ['owner'],
};

/** O papel possui a capacidade? */
export function can(role: string | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (CAPABILITY_ROLES[capability] as readonly string[]).includes(role);
}
