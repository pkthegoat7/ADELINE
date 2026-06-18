'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AdelinaMark } from '@/components/brand/Logo';
import { CalendarRange, BedDouble, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';

interface PublicLink {
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  amount: number;
  description: string | null;
  property: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: string[];
  termsOfService: string;
  lgpdConsent: string;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PagamentoPage() {
  const { token } = useParams<{ token: string }>();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptLgpd, setAcceptLgpd] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pay', token],
    queryFn: () => api<PublicLink>(`/payments/pay/${token}`),
  });

  const checkout = useMutation({
    mutationFn: () =>
      api<{ initPoint: string }>(`/payments/pay/${token}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ acceptTerms, acceptLgpd }),
      }),
    onSuccess: ({ initPoint }) => {
      window.location.href = initPoint;
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </main>
    );
  }

  if (!data || data.status !== 'pending') {
    const msg =
      data?.status === 'paid'
        ? 'Este pagamento já foi concluído. Obrigado!'
        : data?.status === 'expired'
          ? 'Este link de pagamento expirou. Solicite um novo à pousada.'
          : data?.status === 'cancelled'
            ? 'Este link de pagamento foi cancelado.'
            : 'Link de pagamento não encontrado.';
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg mx-auto mb-4" />
          <p className="text-ink-soft">{msg}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-6">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold text-ink">{data.property}</h1>
          <p className="text-ink-soft text-sm mt-1">Pagamento da reserva</p>
        </div>

        <div className="surface-card p-6 space-y-4">
          <div>
            <span className="text-xs text-ink-muted">Hóspede</span>
            <p className="text-ink font-medium">{data.guestName}</p>
          </div>

          <div className="flex items-start gap-2 text-sm">
            <CalendarRange className="w-4 h-4 text-brand-500 mt-0.5" />
            <span className="text-ink">
              {fmt(data.checkIn)} → {fmt(data.checkOut)}{' '}
              <span className="text-ink-muted">({data.nights} noite{data.nights > 1 ? 's' : ''})</span>
            </span>
          </div>

          {data.rooms.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <BedDouble className="w-4 h-4 text-brand-500 mt-0.5" />
              <span className="text-ink">{data.rooms.join(', ')}</span>
            </div>
          )}

          {data.description && (
            <p className="text-sm text-ink-soft border-t border-line pt-3">{data.description}</p>
          )}

          <div className="border-t border-line pt-4 flex items-baseline justify-between">
            <span className="text-ink-soft text-sm">Total a pagar</span>
            <span className="font-display text-3xl font-bold text-ink">
              R$ {data.amount.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        <div className="surface-card p-5 mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand-500"
            />
            <span className="text-ink-soft">
              Li e aceito os <strong className="text-ink">Termos de Uso e Serviço</strong>.
              <span className="block text-xs text-ink-muted mt-1">{data.termsOfService}</span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={acceptLgpd}
              onChange={(e) => setAcceptLgpd(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand-500"
            />
            <span className="text-ink-soft">
              Concordo com o tratamento dos meus dados conforme a <strong className="text-ink">LGPD</strong>.
              <span className="block text-xs text-ink-muted mt-1">{data.lgpdConsent}</span>
            </span>
          </label>
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

        <button
          onClick={() => {
            setError('');
            checkout.mutate();
          }}
          disabled={!acceptTerms || !acceptLgpd || checkout.isPending}
          className="btn-primary w-full px-7 py-3 text-sm mt-4 disabled:opacity-50"
        >
          {checkout.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Redirecionando…
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" /> Pagar agora
            </>
          )}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted mt-4">
          <ShieldCheck className="w-3.5 h-3.5" /> Pagamento seguro via Mercado Pago
        </p>
      </div>
    </main>
  );
}
