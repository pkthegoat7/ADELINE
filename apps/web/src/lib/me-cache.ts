// Snapshot do /me persistido no localStorage para semear o React Query na
// recarga/abertura do PWA — assim a navegação que depende de papel/super-admin
// (sidebar) renderiza na hora, sem esperar o fetch. O /me real roda em segundo
// plano e corrige o snapshot. A autorização de verdade é sempre no servidor.

const KEY = 'adelina-me';

export interface MeSnapshot {
  user?: {
    id?: string;
    email?: string;
    fullName?: string;
    role?: string;
    isSuperAdmin?: boolean;
  };
  tenant?: { name?: string; appearance?: unknown };
}

export function readMeCache(): MeSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MeSnapshot) : undefined;
  } catch {
    return undefined;
  }
}

export function writeMeCache(me: MeSnapshot | undefined): void {
  if (typeof window === 'undefined' || !me) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    /* quota/privado — ignora */
  }
}

export function clearMeCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
