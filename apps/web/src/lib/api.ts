const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { headers, ...rest } = init;
  const res = await fetch(`${BASE}/api${path}`, {
    ...rest,
    // Sessão via cookie httpOnly compartilhado entre web e api
    credentials: 'include',
    headers: {
      // Content-Type só quando há corpo: Fastify rejeita JSON anunciado com body vazio
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      const m = json?.message ?? json?.error;
      if (m) msg = Array.isArray(m) ? m.join('; ') : String(m);
    } catch {
      /* não-JSON: usa o texto cru */
    }
    throw new Error(msg || `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}
