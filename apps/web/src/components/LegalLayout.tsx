export function LegalLayout({ title, html, version }: { title: string; html: string; version: string }) {
  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <a href="/" className="text-sm text-ink-muted hover:text-ink">← Voltar ao início</a>
        <h1 className="font-display text-3xl font-bold text-ink mt-4 mb-6">{title}</h1>
        <article
          className="space-y-4 text-ink-soft leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-6 [&_a]:text-brand-600 [&_a]:underline [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-ink-muted/30 [&_blockquote]:pl-4 [&_blockquote]:italic"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="text-xs text-ink-muted mt-10">Versão {version}</p>
      </div>
    </main>
  );
}
