'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="text-sm text-ink-muted py-4">Carregando…</div>
        </Shell>
      }
    >
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(json.message) ? json.message.join('; ') : json.message;
        throw new Error(msg ?? 'Falha ao redefinir senha');
      }
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Shell>
        <p className="text-sm text-ink-soft">
          Link inválido — falta o código de redefinição. Solicite um novo em{' '}
          <Link href="/esqueci-senha" className="underline">
            esqueci minha senha
          </Link>
          .
        </p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="flex items-center gap-2.5 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-200 rounded-lg px-3 py-2.5">
          <Check className="w-4 h-4" /> Senha redefinida! Redirecionando pro login…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label
            className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted"
            htmlFor="password"
          >
            Nova senha
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-base mt-1"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label
            className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted"
            htmlFor="confirm"
          >
            Confirmar nova senha
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-base mt-1"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm surface-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Criar nova senha</h1>
          <p className="text-sm text-ink-muted mt-1">Mínimo de 8 caracteres.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
