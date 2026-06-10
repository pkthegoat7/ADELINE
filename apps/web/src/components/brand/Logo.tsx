import { useId } from 'react';

/*
 * Logomarca Adelina — monograma "A" em linha com travessa em arco
 * (porta de pousada). Monocromática, em tons neutros: grafite + off-white.
 */
const LEGS_D = 'M19 49L32 15L45 49';
const ARCH_D = 'M22.5 40Q32 29 41.5 40';

/** Tile completo: fundo grafite neutro + monograma off-white. */
export function AdelinaMark({ className }: { className?: string }) {
  const id = useId();
  const grad = `${id}-g`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e2924" />
          <stop offset="1" stopColor="#1b1714" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${grad})`} />
      <rect
        x="0.5"
        y="0.5"
        width="63"
        height="63"
        rx="13.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.10"
      />
      <g
        fill="none"
        stroke="#f4efe7"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={LEGS_D} />
        <path d={ARCH_D} />
      </g>
    </svg>
  );
}

/** Apenas o monograma, monocromático (currentColor) — pra fundos coloridos. */
export function AdelinaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={LEGS_D} />
        <path d={ARCH_D} />
      </g>
    </svg>
  );
}
