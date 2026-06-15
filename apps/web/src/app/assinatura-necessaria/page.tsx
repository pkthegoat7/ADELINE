'use client';

import { useState } from 'react';
import { AdelinaMark } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import { ArrowRight, CreditCard, LogOut } from 'lucide-react';

export default function AssinaturaNecessaria() {
  const [loading, setLoading] = useState(false);

  async function handleResubscribe() {
    if (loading) return;
    setLoading(true);
    try {
      const { initPoint } = await api<{ initPoint: string }>('/subscriptions/create-preapproval', {
        method: 'POST',
      });
      window.location.href = initPoint;
    } catch {
      alert('Erro ao iniciar checkout. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg" />
        </div>

        <h1 className="font-display text-2xl font-bold text-ink mb-2">
          Assinatura inativa
        </h1>
        <p className="text-ink-soft text-sm mb-8">
          Sua assinatura foi cancelada ou expirou. Renove para continuar usando o Adelina PMS.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleResubscribe}
            disabled={loading}
            className="btn-primary w-full px-7 py-3 text-sm group disabled:opacity-60"
          >
            {loading ? (
              'Redirecionando…'
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Reativar assinatura
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="btn-ghost w-full px-7 py-3 text-sm text-ink-muted hover:text-ink"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </main>
  );
}
