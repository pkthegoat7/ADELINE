'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? 'Falha ao solicitar redefinição');
      }
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm surface-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Esqueceu sua senha?</h1>
          <p className="text-sm text-ink-muted mt-1">
            Informe seu email. O link pra criar uma nova senha será enviado pro{' '}
            <strong>WhatsApp da pousada</strong>.
          </p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-200 rounded-lg px-3 py-2.5">
              <MessageCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Se o email existir, o link de redefinição chegou no WhatsApp conectado da
                pousada (válido por 30 minutos).
              </span>
            </div>
            <Link href="/login" className="btn-secondary w-full">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label
                className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-muted"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base mt-1"
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Enviando…' : 'Enviar link'}
            </button>

            <Link
              href="/login"
              className="block text-center text-xs text-ink-muted hover:text-ink"
            >
              Voltar ao login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
