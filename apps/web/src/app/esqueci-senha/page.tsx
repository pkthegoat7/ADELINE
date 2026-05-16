'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-lg p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Esqueceu sua senha?</h1>
          <p className="text-sm text-stone-500">
            Informe seu email e enviaremos um link pra criar uma nova senha.
          </p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-md p-3">
              ✓ Enviamos um link para <strong>{email}</strong>. Verifique sua caixa de entrada
              (e a pasta de spam).
            </div>
            <Link
              href="/login"
              className="block text-center text-sm text-stone-900 hover:underline font-medium"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
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
              {loading ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>

            <p className="text-xs text-center text-stone-500">
              <Link href="/login" className="text-stone-900 hover:underline font-medium">
                Voltar ao login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
