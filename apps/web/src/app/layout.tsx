import type { Metadata, Viewport } from 'next';
import { Inter, Poppins, JetBrains_Mono, Fraunces } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const poppins = Poppins({
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

// Serifada display p/ o tema de fonte "Elegante" (data-font="elegante").
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Adelina — Gestão para pousadas',
  description: 'Property Management System para pousadas e hotéis de hospitalidade artesanal.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable} ${jetbrainsMono.variable} ${fraunces.variable}`} suppressHydrationWarning>
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
                  // Sem preferência explícita: a landing ('/') é escura por padrão;
                  // demais rotas seguem o sistema.
                  else dark = (location.pathname === '/') ? true : prefersDark;
                  if (dark) h.classList.add('dark');

                  var ap = localStorage.getItem('adelina-appearance');
                  var brand = 'terracota', density = 'normal', radius = 'default',
                      style = 'boutique', font = 'default', bg = 'plain';
                  if (ap) {
                    var p = JSON.parse(ap);
                    if (p && typeof p === 'object') {
                      if (p.brand) brand = p.brand;
                      if (p.density) density = p.density;
                      if (p.radius) radius = p.radius;
                      if (p.style) style = p.style;
                      if (p.font) font = p.font;
                      if (p.bg) bg = p.bg;
                    }
                  }
                  h.setAttribute('data-brand', brand);
                  h.setAttribute('data-density', density);
                  h.setAttribute('data-radius', radius);
                  h.setAttribute('data-style', style);
                  h.setAttribute('data-font', font);
                  h.setAttribute('data-bg', bg);
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
