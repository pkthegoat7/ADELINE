import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Adelina — Gestão para pousadas',
    short_name: 'Adelina',
    description:
      'Property Management System para pousadas e hotéis de hospitalidade artesanal.',
    start_url: '/painel',
    display: 'standalone',
    background_color: '#fbf8f3',
    theme_color: '#fbf8f3',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
