'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Save, Eye, EyeOff, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

interface MeResponse {
  user: { isSuperAdmin?: boolean };
}

interface SystemSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export default function AdminConfiguracoes() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  if (me && !me.user.isSuperAdmin) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-12 h-12 text-danger mx-auto mb-4" />
        <p className="text-ink-soft">Acesso restrito a super admins.</p>
        <Link href="/dashboard" className="btn-primary px-4 py-2 text-sm mt-4 inline-flex">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Configurações do Sistema</h2>
        <p className="text-ink-soft text-sm mt-1">
          Configurações globais da plataforma. Apenas super admins têm acesso.
        </p>
      </div>

      <MercadoPagoSection />
    </div>
  );
}

function MercadoPagoSection() {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<SystemSetting[]>('/admin/settings'),
  });

  const currentToken = settings?.find((s) => s.key === 'mp_access_token');

  const save = useMutation({
    mutationFn: () =>
      api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'mp_access_token', value: token }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      setToken('');
      toast.success('Token do Mercado Pago salvo com sucesso');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', err.message),
  });

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
          <CreditCard className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-semibold text-ink">Mercado Pago</h3>
          <p className="text-xs text-ink-muted">Integração de pagamentos e assinaturas</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-muted">Carregando…</div>
      ) : (
        <div className="space-y-4">
          {currentToken && (
            <div className="text-sm">
              <span className="text-ink-muted">Token atual: </span>
              <code className="text-ink bg-surface-sunken px-2 py-0.5 rounded text-xs">
                {currentToken.value}
              </code>
            </div>
          )}

          <div>
            <label htmlFor="mp-token" className="block text-sm font-medium text-ink mb-1">
              {currentToken ? 'Novo Access Token' : 'Access Token'}
            </label>
            <div className="relative">
              <input
                id="mp-token"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="input-base w-full pr-10"
                placeholder="APP_USR-..."
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-1"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              Encontre em{' '}
              <span className="font-medium">mercadopago.com.br/developers → Suas integrações → Credenciais</span>
            </p>
          </div>

          <button
            onClick={() => save.mutate()}
            disabled={!token.trim() || save.isPending}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {save.isPending ? 'Salvando…' : 'Salvar token'}
          </button>
        </div>
      )}
    </div>
  );
}
