import { SetMetadata } from '@nestjs/common';
import type { Capability } from './permissions';

export const CAPABILITY_KEY = 'requiredCapability';

/** Exige que o papel do usuário tenha a capacidade. Aplicado via CapabilityGuard. */
export const RequireCapability = (capability: Capability) =>
  SetMetadata(CAPABILITY_KEY, capability);
