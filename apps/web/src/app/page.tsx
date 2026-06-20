'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdelinaMark } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import {
  ArrowRight,
  BedDouble,
  CalendarRange,
  Check,
  ClipboardCheck,
  Plug,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';

/* Dados estáticos do mockup de timeline (quartos × 7 dias) */
const MOCK_DAYS = [
  { label: 'Seg', day: '10' },
  { label: 'Ter', day: '11' },
  { label: 'Qua', day: '12' },
  { label: 'Qui', day: '13' },
  { label: 'Sex', day: '14' },
  { label: 'Sáb', day: '15', weekend: true },
  { label: 'Dom', day: '16', weekend: true },
];

const MOCK_ROOMS: {
  code: string;
  type: string;
  bars: { start: number; len: number; gradient: string; label: string }[];
}[] = [
  {
    code: '101',
    type: 'Standard',
    bars: [
      { start: 0, len: 3, gradient: 'from-rose-400 to-rose-500', label: 'Airbnb · M. Souza' },
      { start: 4, len: 3, gradient: 'from-emerald-400 to-emerald-500', label: 'Direto · A. Lima' },
    ],
  },
  {
    code: '102',
    type: 'Standard',
    bars: [
      { start: 1, len: 4, gradient: 'from-blue-400 to-blue-500', label: 'Booking · J. Costa' },
    ],
  },
  {
    code: '201',
    type: 'Suíte Master',
    bars: [
      { start: 0, len: 2, gradient: 'from-emerald-400 to-emerald-500', label: 'Direto · R. Alves' },
      { start: 3, len: 4, gradient: 'from-rose-400 to-rose-500', label: 'Airbnb · T. Nunes' },
    ],
  },
  {
    code: '202',
    type: 'Suíte Master',
    bars: [
      { start: 2, len: 3, gradient: 'from-blue-400 to-blue-500', label: 'Booking · P. Reis' },
    ],
  },
];

interface PublicPlan {
  amount: number;
  compareAmount: number | null;
  promoLabel: string | null;
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PublicPlan | null>(null);

  useEffect(() => {
    api<PublicPlan>('/subscriptions/plan')
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);

  const cycleSuffix = '/mês';

  async function handleSubscribe() {
    if (loading) return;
    setLoading(true);
    try {
      // Já logado? Então a conta já existe — não faz sentido cobrar de novo.
      // Manda pro painel sinalizando o aviso de "você já tem o sistema".
      try {
        await api('/me');
        window.location.href = '/painel?ja-assinante=1';
        return;
      } catch {
        // Sem sessão: segue o fluxo normal de assinatura.
      }
      const { initPoint } = await api<{ initPoint: string }>('/subscriptions/create-preapproval', {
        method: 'POST',
      });
      window.location.href = initPoint;
    } catch {
      alert('Erro ao iniciar checkout. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Ornamentos de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 -right-48 w-[42rem] h-[42rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--brand) / 0.55), rgb(var(--gold) / 0.15) 60%, transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[38rem] -left-40 w-[32rem] h-[32rem] rounded-full opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgb(var(--brand-deep) / 0.45), transparent 70%)',
        }}
      />

      {/* ───────────────────────── Navbar ───────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 glass-thin">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <AdelinaMark className="w-8 h-8 rounded-lg shadow-md" />
            <span className="font-display font-bold text-lg text-ink tracking-tight">
              Adelina
            </span>
          </Link>
          <div className="hidden sm:flex items-center gap-7 text-sm font-medium text-ink-soft">
            <a href="#recursos" className="hover:text-ink">Recursos</a>
            <a href="#como-funciona" className="hover:text-ink">Como funciona</a>
            <a href="#preco" className="hover:text-ink">Preço</a>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="btn-secondary px-4 py-2 text-sm">
              Entrar
            </Link>
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Redirecionando…' : 'Assinar'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </nav>
      </header>

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-6 pt-36 pb-20 text-center">
        <div className="stagger">
          <div className="flex justify-center mb-6">
            <span className="badge-premium">
              <Sparkles className="w-3 h-3" />
              Channel manager iCal bidirecional
            </span>
          </div>

          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-ink tracking-[-0.04em] leading-[1.05] max-w-3xl mx-auto">
            Sua pousada inteira,
            <br />
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-gold-500 bg-clip-text text-transparent">
              numa única timeline.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-ink-soft leading-relaxed max-w-xl mx-auto mt-6">
            Gestão completa para pousadas e hotéis — reservas, quartos e hóspedes
            sincronizados com Airbnb e Booking, sem risco de overbooking.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <Link href="/login" className="btn-primary px-7 py-3 text-sm group">
              Entrar no sistema
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/calendario" className="btn-secondary px-7 py-3 text-sm">
              Ver calendário
            </Link>
          </div>
        </div>

        {/* ── Mockup do calendário ── */}
        <div className="relative mt-16 animate-slide-up" style={{ animationDelay: '240ms' }}>
          <div
            aria-hidden
            className="absolute inset-x-12 -bottom-6 h-24 blur-3xl opacity-40 rounded-full"
            style={{ background: 'rgb(var(--brand) / 0.45)' }}
          />
          <div className="relative glass-strong glow-border rounded-2xl p-4 sm:p-6 text-left max-w-4xl mx-auto">
            {/* Barra de título do mockup */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
              </div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
                Sincronizado agora
              </div>
            </div>

            {/* Cabeçalho de dias */}
            <div className="grid" style={{ gridTemplateColumns: '7rem repeat(7, 1fr)' }}>
              <div />
              {MOCK_DAYS.map((d) => (
                <div
                  key={d.day}
                  className={`text-center pb-2 text-[11px] font-semibold uppercase tracking-wide ${
                    d.weekend ? 'text-brand-600 dark:text-brand-400' : 'text-ink-muted'
                  }`}
                >
                  {d.label} <span className="num-tabular">{d.day}</span>
                </div>
              ))}
            </div>

            {/* Linhas de quartos */}
            <div className="space-y-1.5">
              {MOCK_ROOMS.map((room) => (
                <div
                  key={room.code}
                  className="grid items-center"
                  style={{ gridTemplateColumns: '7rem 1fr' }}
                >
                  <div className="pr-3">
                    <div className="text-sm font-semibold text-ink num-tabular leading-tight">
                      {room.code}
                    </div>
                    <div className="text-[10px] text-ink-muted truncate">{room.type}</div>
                  </div>
                  <div className="relative h-9 rounded-lg bg-surface-sunken/60 dark:bg-white/[0.03] overflow-hidden">
                    {/* Grade de dias */}
                    <div aria-hidden className="absolute inset-0 grid grid-cols-7">
                      {MOCK_DAYS.map((d) => (
                        <div
                          key={d.day}
                          className={`border-l border-line/50 first:border-l-0 ${
                            d.weekend ? 'bg-brand-500/[0.045]' : ''
                          }`}
                        />
                      ))}
                    </div>
                    {/* Barras de reserva */}
                    {room.bars.map((bar) => (
                      <div
                        key={bar.label}
                        className={`absolute top-1 bottom-1 rounded-md bg-gradient-to-r ${bar.gradient} shadow-sm flex items-center px-2`}
                        style={{
                          left: `calc(${(bar.start / 7) * 100}% + 2px)`,
                          width: `calc(${(bar.len / 7) * 100}% - 4px)`,
                        }}
                      >
                        <span className="text-[10px] font-semibold text-white truncate drop-shadow-sm">
                          {bar.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legenda de canais */}
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-line/60 text-[11px] font-medium text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Direto
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Airbnb
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Booking
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Recursos ───────────────────────── */}
      <section id="recursos" className="relative max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="eyebrow flex items-center justify-center gap-2 mb-3">
            <span className="ornament">◆</span>
            <span>Recursos</span>
            <span className="ornament">◆</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Tudo o que a operação precisa
          </h2>
          <p className="text-ink-soft mt-3 max-w-lg mx-auto">
            Do check-in ao fechamento do mês, em uma interface pensada para o dia a
            dia da recepção.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            icon={<CalendarRange className="w-5 h-5" />}
            title="Calendário unificado"
            sub="Todos os quartos numa timeline — disponibilidade, bloqueios e reservas num só lugar."
          />
          <FeatureCard
            icon={<Plug className="w-5 h-5" />}
            title="Canais bidirecionais"
            sub="Sincronização iCal com Airbnb e Booking a cada 5 minutos, nos dois sentidos."
          />
          <FeatureCard
            icon={<Shield className="w-5 h-5" />}
            title="Anti-overbooking"
            sub="Trava de concorrência no banco e reconciliação noturna automática."
          />
          <FeatureCard
            icon={<ClipboardCheck className="w-5 h-5" />}
            title="Reservas organizadas"
            sub="Código humano por reserva, status claros e histórico completo de cada estadia."
          />
          <FeatureCard
            icon={<BedDouble className="w-5 h-5" />}
            title="Quartos e tipos"
            sub="Cadastre categorias, andares e status de limpeza — pronto para o housekeeping."
          />
          <FeatureCard
            icon={<Users className="w-5 h-5" />}
            title="Hóspedes centralizados"
            sub="Ficha única por hóspede, mesmo quando a reserva chega pelos canais."
          />
        </div>
      </section>

      {/* ───────────────────────── Como funciona ───────────────────────── */}
      <section id="como-funciona" className="relative max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="eyebrow flex items-center justify-center gap-2 mb-3">
            <span className="ornament">◆</span>
            <span>Como funciona</span>
            <span className="ornament">◆</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            No ar em três passos
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StepCard
            n="1"
            title="Cadastre a pousada"
            sub="Propriedade, tipos de quarto e tarifas — leva poucos minutos."
          />
          <StepCard
            n="2"
            title="Conecte os canais"
            sub="Cole os links iCal do Airbnb e do Booking. A sincronização começa sozinha."
          />
          <StepCard
            n="3"
            title="Opere pela timeline"
            sub="Reservas dos canais aparecem no calendário; as suas são exportadas de volta."
          />
        </div>
      </section>

      {/* ───────────────────────── Preço ───────────────────────── */}
      <section id="preco" className="relative max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="eyebrow flex items-center justify-center gap-2 mb-3">
            <span className="ornament">◆</span>
            <span>Preço</span>
            <span className="ornament">◆</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Plano único, sem surpresas
          </h2>
          <p className="text-ink-soft mt-3 max-w-lg mx-auto">
            Tudo incluso num só valor. Sem limites de quartos, sem taxa por reserva.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="surface-card glow-border p-8 text-center">
            <div className="font-display font-bold text-lg text-ink mb-1">Adelina PMS</div>
            <div className="mb-6">
              {plan ? (
                <>
                  {plan.compareAmount && (
                    <div className="flex items-center justify-center gap-2 mb-1.5 animate-fade-in">
                      <span className="text-ink-muted line-through text-lg">
                        R$ {formatBRL(plan.compareAmount)}
                      </span>
                      {plan.promoLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-brand text-white px-2.5 py-0.5 text-xs font-semibold shadow-soft">
                          <Sparkles className="w-3 h-3" />
                          {plan.promoLabel}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="font-display text-5xl font-bold text-ink">
                      R$ {formatBRL(plan.amount)}
                    </span>
                    <span className="text-ink-muted text-sm">{cycleSuffix}</span>
                  </div>
                </>
              ) : (
                <div className="h-12 w-36 mx-auto rounded-lg bg-surface-sunken animate-pulse" />
              )}
            </div>

            <ul className="space-y-3 text-left text-sm text-ink mb-8">
              {[
                'Calendário unificado',
                'Canais bidirecionais (Airbnb + Booking)',
                'Anti-overbooking automático',
                'Gestão de hóspedes',
                'Equipe ilimitada',
                'Suporte por WhatsApp',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="btn-primary w-full px-7 py-3 text-sm group disabled:opacity-60"
            >
              {loading ? 'Redirecionando…' : 'Assinar agora'}
              {!loading && (
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ───────────────────────── CTA final ───────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-6 pb-20">
        <div className="relative overflow-hidden rounded-2xl glow-border">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgb(var(--brand-700)) 0%, rgb(var(--brand-500)) 55%, rgb(var(--gold)) 130%)',
            }}
          />
          <div
            aria-hidden
            className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-25 blur-3xl bg-white"
          />
          <div className="relative px-8 py-14 sm:px-14 text-center">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Pronto para assumir o controle?
            </h2>
            <p className="text-white/85 mt-3 max-w-md mx-auto text-sm sm:text-base">
              Entre no sistema e veja a disponibilidade da sua pousada em tempo real.
            </p>
            <div className="flex justify-center mt-8">
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-white text-brand-800 text-sm font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60"
              >
                {loading ? 'Redirecionando…' : 'Assinar agora'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Footer ───────────────────────── */}
      <footer className="relative border-t border-line/60">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AdelinaMark className="w-6 h-6 rounded-md" />
            <span className="font-display font-semibold text-sm text-ink">Adelina</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <a href="/termos" className="hover:text-ink">Termos de Uso</a>
            <a href="/privacidade" className="hover:text-ink">Política de Privacidade</a>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-ink-muted uppercase tracking-[0.22em] font-medium">
            <span className="font-mono">v0.2.0</span>
            <span className="ornament">◆</span>
            <span>Hospitalidade artesanal</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="surface-card p-6 text-left card-hover">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 dark:from-brand-900/40 dark:to-brand-900/20 dark:text-brand-300 mb-4">
        {icon}
      </span>
      <div className="text-base font-semibold text-ink leading-tight">{title}</div>
      <div className="text-sm text-ink-muted mt-1.5 leading-relaxed">{sub}</div>
    </div>
  );
}

function StepCard({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="surface-card p-6 text-left card-hover">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white font-display font-bold text-sm shadow-md num-tabular">
          {n}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      </div>
      <div className="text-base font-semibold text-ink leading-tight">{title}</div>
      <div className="text-sm text-ink-muted mt-1.5 leading-relaxed">{sub}</div>
    </div>
  );
}
