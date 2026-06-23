/** Versão tile (fundo grafite + marca colorida) — usada na sidebar e favicon. */
export function AdelinaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect width="64" height="64" rx="13" fill="#1B1B1B" />
      <svg x="7" y="7" width="50" height="50" viewBox="0 0 240 240">
        <polygon points="120,24 28,210 120,210" fill="#ED7D1A" />
        <polygon points="120,24 212,210 120,210" fill="#F2ECE1" />
        <g stroke="#BF5F0E" strokeWidth="3" strokeLinecap="round" opacity="0.4">
          <line x1="97" y1="70" x2="118" y2="70" />
          <line x1="78" y1="110" x2="118" y2="110" />
          <line x1="58" y1="150" x2="118" y2="150" />
        </g>
        <polygon points="120,94 90,186 150,186" fill="#231F1B" stroke="#F2ECE1" strokeWidth="5.5" strokeLinejoin="round" />
        <line x1="102" y1="150" x2="138" y2="150" stroke="#F2ECE1" strokeWidth="5.5" strokeLinecap="round" />
        <line x1="120" y1="28" x2="120" y2="94" stroke="#F2ECE1" strokeWidth="5.5" strokeLinecap="round" />
        <polygon points="120,24 28,210 212,210" fill="none" stroke="#F2ECE1" strokeWidth="9" strokeLinejoin="round" />
      </svg>
    </svg>
  );
}

/** Símbolo colorido em fundo transparente — para fundos claros. */
export function AdelinaSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden focusable="false">
      <ellipse cx="120" cy="216" rx="100" ry="11" fill="#C7BEB2" />
      <polygon points="120,24 28,210 120,210" fill="#ED7D1A" />
      <polygon points="120,24 212,210 120,210" fill="#F2ECE1" />
      <g stroke="#BF5F0E" strokeWidth="3" strokeLinecap="round" opacity="0.35">
        <line x1="97" y1="70" x2="118" y2="70" />
        <line x1="78" y1="110" x2="118" y2="110" />
        <line x1="58" y1="150" x2="118" y2="150" />
      </g>
      <polygon points="120,94 90,186 150,186" fill="#FAF6EF" stroke="#1B1B1B" strokeWidth="5.5" strokeLinejoin="round" />
      <line x1="102" y1="150" x2="138" y2="150" stroke="#1B1B1B" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="120" y1="28" x2="120" y2="94" stroke="#1B1B1B" strokeWidth="5.5" strokeLinecap="round" />
      <polygon points="120,24 28,210 212,210" fill="none" stroke="#1B1B1B" strokeWidth="9" strokeLinejoin="round" />
    </svg>
  );
}

/** Contorno monocromático (currentColor) — para fundos coloridos. */
export function AdelinaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden focusable="false">
      <polygon points="120,24 28,210 212,210" fill="none" stroke="currentColor" strokeWidth="9" strokeLinejoin="round" />
      <polygon points="120,94 90,186 150,186" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinejoin="round" />
      <line x1="120" y1="28" x2="120" y2="94" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="102" y1="150" x2="138" y2="150" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}
