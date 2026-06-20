import { marked } from 'marked';

// Estas páginas são Server Components: o fetch roda DENTRO do container web.
// O domínio público da API não faz hairpin de dentro do overlay do Swarm
// (timeout), então em produção usamos a URL interna do serviço (API_INTERNAL_URL,
// ex.: http://api:3333). NEXT_PUBLIC_API_URL fica como fallback (dev/local).
const API =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export async function fetchLegalDoc(doc: 'termos' | 'privacidade') {
  const res = await fetch(`${API}/api/legal/${doc}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Falha ao carregar o documento.');
  const data = (await res.json()) as { title: string; markdown: string; version: string };
  const html = marked.parse(data.markdown, { async: false }) as string;
  return { ...data, html };
}
