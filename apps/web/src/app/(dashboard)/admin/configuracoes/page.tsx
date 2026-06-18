'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Save, Eye, EyeOff, CreditCard, Tag, Trash2, Percent } from 'lucide-react';
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
        <Link href="/painel" className="btn-primary px-4 py-2 text-sm mt-4 inline-flex">
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
      <PlanoSection />
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
      toast.success('Token salvo. O plano será recriado na sua conta no próximo checkout.');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', err.message),
  });

  const remove = useMutation({
    mutationFn: () =>
      api('/admin/settings/mp_access_token', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      setToken('');
      toast.success('Token removido. O checkout fica desativado até você cadastrar um novo.');
    },
    onError: (err: Error) => toast.error('Erro ao remover', err.message),
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="text-ink-muted">Token atual: </span>
                <code className="text-ink bg-surface-sunken px-2 py-0.5 rounded text-xs">
                  {currentToken.value}
                </code>
              </div>
              <button
                onClick={() => {
                  if (
                    confirm(
                      'Remover o token do Mercado Pago? O checkout fica desativado até você cadastrar um novo, e o plano atual será recriado na próxima assinatura.',
                    )
                  ) {
                    remove.mutate();
                  }
                }}
                disabled={remove.isPending}
                className="btn-ghost text-xs text-danger hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {remove.isPending ? 'Removendo…' : 'Remover token'}
              </button>
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

function PlanoSection() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [compareAmount, setCompareAmount] = useState('');
  const [promoLabel, setPromoLabel] = useState('');
  const [loaded, setLoaded] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<SystemSetting[]>('/admin/settings'),
  });

  // Preenche os campos com os valores salvos na primeira carga
  if (settings && !loaded) {
    setAmount(settings.find((s) => s.key === 'mp_plan_amount')?.value ?? '');
    setReason(settings.find((s) => s.key === 'mp_plan_reason')?.value ?? '');
    setCompareAmount(settings.find((s) => s.key === 'mp_plan_compare_amount')?.value ?? '');
    setPromoLabel(settings.find((s) => s.key === 'mp_plan_promo_label')?.value ?? '');
    setLoaded(true);
  }

  // Promo só vale se o "de" for maior que o preço atual.
  const compareNum = Number(compareAmount);
  const amountNum = Number(amount);
  const promoActive =
    Number.isFinite(compareNum) && Number.isFinite(amountNum) && compareNum > amountNum;

  const save = useMutation({
    mutationFn: async () => {
      // Salva/remove uma config; remove (DELETE) quando o valor está vazio.
      const put = (key: string, value: string) =>
        api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) });
      const del = (key: string) => api(`/admin/settings/${key}`, { method: 'DELETE' });

      await put('mp_plan_amount', amount.trim());
      await put('mp_plan_reason', reason.trim());

      await (compareAmount.trim()
        ? put('mp_plan_compare_amount', compareAmount.trim())
        : del('mp_plan_compare_amount'));
      await (promoLabel.trim()
        ? put('mp_plan_promo_label', promoLabel.trim())
        : del('mp_plan_promo_label'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('Plano de assinatura salvo com sucesso');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', err.message),
  });

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
          <Tag className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-semibold text-ink">Plano de assinatura</h3>
          <p className="text-xs text-ink-muted">Preço, descrição e ciclo do checkout</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-muted">Carregando…</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="plan-amount" className="block text-sm font-medium text-ink mb-1">
              Valor (R$)
            </label>
            <input
              id="plan-amount"
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-base w-full"
              placeholder="249.00"
            />
          </div>

          <div>
            <label htmlFor="plan-reason" className="block text-sm font-medium text-ink mb-1">
              Descrição (aparece no checkout do Mercado Pago)
            </label>
            <input
              id="plan-reason"
              type="text"
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-base w-full"
              placeholder="Adelina PMS — Assinatura Mensal"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-ink mb-1">Ciclo de cobrança</span>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-3 text-sm">
              <span className="font-semibold text-ink">Mensal</span>
              <span className="text-ink-muted">— cobrança recorrente todo mês</span>
            </div>
          </div>

          {/* ── Promoção (opcional) ───────────────────────────────── */}
          <div className="rounded-xl border border-dashed border-line p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-medium text-ink">Promoção na landing (opcional)</span>
            </div>
            <p className="text-xs text-ink-muted -mt-1">
              Preencha o preço cheio (&ldquo;de&rdquo;) para a landing mostrar o desconto. O
              cliente continua pagando o <strong>Valor</strong> acima. Deixe vazio para tirar a
              promoção.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="plan-compare" className="block text-xs font-medium text-ink mb-1">
                  Preço cheio &ldquo;de&rdquo; (R$)
                </label>
                <input
                  id="plan-compare"
                  type="number"
                  min="1"
                  step="0.01"
                  value={compareAmount}
                  onChange={(e) => setCompareAmount(e.target.value)}
                  className="input-base w-full"
                  placeholder="349.00"
                />
              </div>
              <div>
                <label htmlFor="plan-promo-label" className="block text-xs font-medium text-ink mb-1">
                  Selo da promoção
                </label>
                <input
                  id="plan-promo-label"
                  type="text"
                  maxLength={40}
                  value={promoLabel}
                  onChange={(e) => setPromoLabel(e.target.value)}
                  className="input-base w-full"
                  placeholder="Oferta de lançamento"
                />
              </div>
            </div>
            {compareAmount.trim() && !promoActive && (
              <p className="text-xs text-warn">
                O preço &ldquo;de&rdquo; precisa ser maior que o Valor para a promoção aparecer.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-soft">
            <Tag className="w-4 h-4 text-brand-500 flex-shrink-0" />
            <span>
              Plano atual:{' '}
              {promoActive && (
                <span className="text-ink-muted line-through mr-1">R$ {compareAmount.trim()}</span>
              )}
              <strong className="text-ink">
                {amount.trim() ? `R$ ${amount.trim()}` : '—'}
              </strong>{' '}
              por mês
              {promoActive && (
                <span className="ml-2 inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[11px] font-medium">
                  {promoLabel.trim() || 'Oferta por tempo limitado'}
                </span>
              )}
            </span>
          </div>

          <button
            onClick={() => save.mutate()}
            disabled={!amount.trim() || !reason.trim() || save.isPending}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {save.isPending ? 'Salvando…' : 'Salvar plano'}
          </button>
        </div>
      )}
    </div>
  );
}
