/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // ADL-2: rotas canônicas em pt-BR. Aliases EN antigos redirecionam (308)
  // para não quebrar links compartilhados/marcados.
  async redirects() {
    const map = {
      '/dashboard': '/painel',
      '/calendar': '/calendario',
      '/reservations': '/reservas',
      '/rooms': '/quartos',
      '/guests': '/hospedes',
      '/channels': '/canais',
      '/settings': '/configuracoes',
    };
    return Object.entries(map).map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
  async rewrites() {
    return [
      {
        source: '/proxy-api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

export default nextConfig;
