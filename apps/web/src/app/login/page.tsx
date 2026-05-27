'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
  const next = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError(translateError(signInError.message));
      return;
    }
    router.replace(next as never);
    router.refresh();
  }

  return (
    <LoginShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted" htmlFor="password">
              Senha
            </label>
            <Link
              href="/esqueci-senha"
              className="text-xs text-ink-soft hover:text-brand-600 hover:underline transition-colors"
            >
              Esqueceu?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className="input-base"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </LoginShell>
  );
}

function LoginShell({ children, loading }: { children?: React.ReactNode; loading?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4 relative overflow-hidden">
      {/* Ornamento de fundo */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 50% at 30% 20%, rgb(245 230 211 / 0.45), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgb(237 206 170 / 0.35), transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-sm surface-card p-7 shadow-modal space-y-5 animate-scale-in glow-border">
        <div className="flex items-center gap-3 pb-1">
          <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-gold-300 via-brand-400 to-brand-700 flex items-center justify-center text-[#1a140d] shadow-md shadow-brand-900/30">
            <span className="font-serif font-bold text-lg">A</span>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-gold-300 shadow-md shadow-gold-500/60 animate-pulse" />
          </div>
          <div>
            <div className="font-serif text-xl tracking-serif text-ink">Adelina</div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-muted -mt-0.5">
              Pousadas boutique
            </p>
          </div>
        </div>

        <div className="divider-ornament">
          <span className="ornament">◆</span>
        </div>

        {loading ? (
          <div className="py-6 text-center text-ink-muted text-sm">Carregando…</div>
        ) : (
          children
        )}

        <p className="text-[11px] text-ink-muted text-center pt-2">
          Acesso restrito a colaboradores autorizados.
        </p>
      </div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Email ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Email ainda não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('Too many requests') || msg.includes('rate limit'))
    return 'Muitas tentativas. Aguarde alguns minutos.';
  if (msg.includes('User not found')) return 'Usuário não encontrado.';
  if (msg.includes('network') || msg.includes('Failed to fetch'))
    return 'Erro de conexão. Verifique sua internet.';
  return msg;
}
