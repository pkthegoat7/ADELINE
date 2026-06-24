'use client';

import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { writeMeCache, type MeSnapshot } from '@/lib/me-cache';
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Eye,
  EyeOff,
  Plug,
  Shield,
} from 'lucide-react';
import { AdelinaGlyph, AdelinaMark } from '@/components/brand/Logo';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell loading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = params.get('next') ?? '/painel';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(json.message) ? json.message.join('; ') : json.message;
        throw new Error(msg ?? 'Falha no login');
      }
      // A resposta do login JÁ traz user (com isSuperAdmin) e tenant.name — semeia
      // o cache do React Query e o localStorage ANTES de navegar, sem depender de
      // uma 2ª chamada (/me) que pode atrasar. Assim a aba super-admin aparece na
      // hora, inclusive em navegador novo (1º acesso). O /me roda em segundo plano
      // (invalidate) só p/ enriquecer com appearance/tenant completos.
      if (json?.user) {
        const seed: MeSnapshot = { user: json.user, tenant: json.tenant };
        qc.setQueryData(['me'], seed);
        writeMeCache(seed);
        qc.invalidateQueries({ queryKey: ['me'] });
      }
      router.replace(next as never);
      router.refresh();
    } catch (err) {
      setError(translateError((err as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            required
            autoComplete="email"
            placeholder="voce@suapousada.com.br"
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted"
              htmlFor="password"
            >
              Senha
            </label>
            <Link
              href="/esqueci-senha"
              className="text-xs text-ink-soft hover:text-brand-600 hover:underline transition-colors"
            >
              Esqueceu?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
              className="input-base pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2.5 animate-scale-in">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full group">
          {loading ? (
            'Entrando…'
          ) : (
            <>
              Entrar
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>
    </LoginShell>
  );
}

function LoginShell({ children, loading }: { children?: React.ReactNode; loading?: boolean }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface">
      {/* ───────── Painel de marca (esquerda) ───────── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(150deg, rgb(var(--brand-800)) 0%, rgb(var(--brand-600)) 50%, rgb(var(--brand-700)) 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'rgb(var(--gold) / 0.8)' }}
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full opacity-20 blur-3xl bg-white"
        />

        {/* Topo: logo */}
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25">
              <AdelinaGlyph className="w-6 h-6 text-white" />
            </span>
            <span className="font-display font-bold text-xl tracking-tight">Adelina</span>
          </Link>
        </div>

        {/* Meio: frase de valor */}
        <div className="relative max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/70 mb-4">
            Property Management System
          </p>
          <h2 className="font-display text-3xl font-bold leading-snug tracking-tight">
            A operação da sua pousada, sob controle.
          </h2>
          <div className="mt-8 space-y-4">
            <BrandFeature
              icon={<CalendarRange className="w-4 h-4" />}
              text="Todos os quartos numa única timeline"
            />
            <BrandFeature
              icon={<Plug className="w-4 h-4" />}
              text="Sincronizado com Airbnb e Booking"
            />
            <BrandFeature
              icon={<Shield className="w-4 h-4" />}
              text="Proteção anti-overbooking automática"
            />
          </div>
        </div>

        {/* Rodapé */}
        <div className="relative text-[11px] text-white/60 uppercase tracking-[0.18em] font-medium">
          <span className="font-mono">v0.2.0</span> · Hospitalidade artesanal
        </div>
      </aside>

      {/* ───────── Formulário (direita) ───────── */}
      <div className="relative flex flex-col items-center justify-center p-6 sm:p-10 overflow-hidden">
        {/* Ornamento sutil só no mobile/light */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none lg:hidden"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 50% at 30% 20%, rgb(245 230 211 / 0.45), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgb(237 206 170 / 0.35), transparent 60%)',
          }}
        />

        {/* Voltar ao site */}
        <Link
          href="/"
          className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao site
        </Link>

        <div className="relative w-full max-w-sm animate-scale-in">
          {/* Logo no mobile (painel esquerdo some) */}
          <div className="flex lg:hidden justify-center mb-6">
            <AdelinaMark className="w-12 h-12 rounded-xl shadow-md" />
          </div>

          <div className="text-center lg:text-left mb-7">
            <h1 className="font-display text-2xl font-bold text-ink tracking-tight">
              Bem-vindo de volta
            </h1>
            <p className="text-sm text-ink-soft mt-1.5">
              Entre para acessar o painel da sua pousada.
            </p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-ink-muted text-sm">Carregando…</div>
          ) : (
            children
          )}

          <p className="text-[11px] text-ink-muted text-center mt-7">
            Acesso restrito a colaboradores autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandFeature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="text-sm text-white/90 font-medium">{text}</span>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes('ThrottlerException') || msg.includes('Too Many'))
    return 'Muitas tentativas. Aguarde alguns minutos.';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return 'Erro de conexão. Verifique sua internet.';
  return msg;
}
