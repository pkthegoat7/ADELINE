import Link from 'next/link';
import { ArrowRight, CalendarRange, Shield, Plug } from 'lucide-react';

export default function Home() {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 py-16 overflow-hidden">
      {/* Ornamento decorativo de fundo — círculo grande borrado */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--brand) / 0.55), rgb(var(--gold) / 0.15) 60%, transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 w-[28rem] h-[28rem] rounded-full opacity-20 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--brand-deep) / 0.45), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-2xl text-center stagger">
        {/* Logomark */}
        <div className="flex justify-center mb-7">
          <div className="relative">
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-gold-300 via-brand-400 to-brand-700 flex items-center justify-center text-[#0a0a0c] shadow-elevated">
              <span className="font-display font-bold text-4xl leading-none">A</span>
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-gold-300 shadow-md shadow-gold-500/60 pulse-dot" />
            </div>
            <div
              aria-hidden
              className="absolute inset-0 rounded-2xl blur-2xl opacity-50 -z-10"
              style={{ background: 'rgb(var(--brand) / 0.6)' }}
            />
          </div>
        </div>

        {/* Eyebrow */}
        <div className="eyebrow flex items-center justify-center gap-2 mb-3">
          <span className="ornament">◆</span>
          <span>Property Management · Boutique</span>
          <span className="ornament">◆</span>
        </div>

        {/* Wordmark */}
        <h1 className="font-display text-7xl sm:text-8xl font-bold text-ink tracking-[-0.04em] leading-none">
          Adelina
        </h1>

        {/* Divider ornamentado */}
        <div className="divider-ornament max-w-xs mx-auto mt-7 mb-6">
          <span className="ornament">◆</span>
        </div>

        {/* Tagline */}
        <p className="text-base sm:text-lg text-ink-soft leading-relaxed max-w-xl mx-auto">
          Gestão completa para pousadas e hotéis boutique, com channel manager
          bidirecional integrado a Airbnb e Booking.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link href="/login" className="btn-primary px-6 py-3 text-sm group">
            Entrar no sistema
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="/calendar" className="btn-secondary px-6 py-3 text-sm">
            Ver calendário
          </Link>
        </div>

        {/* Feature pills */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Feature
            icon={<CalendarRange className="w-4 h-4" />}
            title="Calendário unificado"
            sub="Todos os quartos numa timeline"
          />
          <Feature
            icon={<Plug className="w-4 h-4" />}
            title="Canais bidirecionais"
            sub="iCal Airbnb · Booking"
          />
          <Feature
            icon={<Shield className="w-4 h-4" />}
            title="Anti-overbooking"
            sub="Lock + reconcile noturno"
          />
        </div>

        {/* Footer */}
        <div className="mt-14 flex items-center justify-center gap-3 text-[10px] text-ink-muted uppercase tracking-[0.22em] font-medium">
          <span className="font-mono">v0.2.0</span>
          <span className="ornament">◆</span>
          <span>Hospitalidade artesanal</span>
        </div>
      </div>
    </main>
  );
}

function Feature({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="surface-card p-4 flex items-start gap-3 text-left card-hover">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 flex-shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink leading-tight">{title}</div>
        <div className="text-xs text-ink-muted mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
