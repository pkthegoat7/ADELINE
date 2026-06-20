import { marked } from 'marked';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function fetchLegalDoc(doc: 'termos' | 'privacidade') {
  const res = await fetch(`${API}/api/legal/${doc}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Falha ao carregar o documento.');
  const data = (await res.json()) as { title: string; markdown: string; version: string };
  const html = marked.parse(data.markdown, { async: false }) as string;
  return { ...data, html };
}
