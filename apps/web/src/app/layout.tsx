import type { Metadata } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Adelina — Gestão para pousadas',
  description: 'Property Management System para pousadas e hotéis de hospitalidade artesanal.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica tema antes da hidratação pra evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var h = document.documentElement;
                  var t = localStorage.getItem('adelina-theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var dark;
                  if (t === 'dark') dark = true;
                  else if (t === 'light') dark = false;
                  else dark = prefersDark;
                  if (dark) h.classList.add('dark');

                  var ap = localStorage.getItem('adelina-appearance');
                  var brand = 'terracota', density = 'normal', radius = 'default';
                  if (ap) {
                    var p = JSON.parse(ap);
                    if (p && typeof p === 'object') {
                      if (p.brand) brand = p.brand;
                      if (p.density) density = p.density;
                      if (p.radius) radius = p.radius;
                    }
                  }
                  h.setAttribute('data-brand', brand);
                  h.setAttribute('data-density', density);
                  h.setAttribute('data-radius', radius);
                } catch(_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
