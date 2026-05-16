'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
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
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border border-stone-200 rounded-lg p-6 shadow-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Pousada Adelina</h1>
          <p className="text-sm text-stone-500">Acesse sua conta</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-stone-700" htmlFor="password">
              Senha
            </label>
            <Link
              href="/esqueci-senha"
              className="text-xs text-stone-600 hover:text-stone-900 hover:underline"
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
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-stone-900 text-white text-sm font-medium rounded-md hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

      </form>
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
