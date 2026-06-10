import { useId } from 'react';

/*
 * Logomarca Adelina — "A" em forma de chalé com porta em arco e
 * janela redonda (vazados via fill-rule evenodd). A janela revela a
 * camada dourada por trás, como uma luz acesa.
 */
const GLYPH_D =
  'M32 11C34.4 11 36.6 12.4 37.6 14.6L51.4 45.8C53.2 49.9 50.2 54.5 45.7 54.5L18.3 54.5C13.8 54.5 10.8 49.9 12.6 45.8L26.4 14.6C27.4 12.4 29.6 11 32 11Z' +
  'M32 31C36.7 31 40.5 34.8 40.5 39.5L40.5 54.5L23.5 54.5L23.5 39.5C23.5 34.8 27.3 31 32 31Z' +
  'M34.6 21.5C34.6 20.06 33.44 18.9 32 18.9C30.56 18.9 29.4 20.06 29.4 21.5C29.4 22.94 30.56 24.1 32 24.1C33.44 24.1 34.6 22.94 34.6 21.5Z';

/** Tile completo: fundo em gradiente + glifo escuro + janela dourada. */
export function AdelinaMark({ className }: { className?: string }) {
  const id = useId();
  const grad = `${id}-g`;
  const sheen = `${id}-s`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0c46a" />
          <stop offset="0.5" stopColor="#d18f57" />
          <stop offset="1" stopColor="#8a4528" />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${grad})`} />
      <rect width="64" height="32" rx="14" fill={`url(#${sheen})`} />
      <circle cx="32" cy="21.5" r="4.2" fill="#ffd97a" />
      <path d={GLYPH_D} fill="#2a1709" fillRule="evenodd" />
    </svg>
  );
}

/** Apenas o glifo, monocromático (currentColor) — pra fundos coloridos. */
export function AdelinaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <path d={GLYPH_D} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
