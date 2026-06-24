'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Monitor, Moon, Sun, CreditCard, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { MessageTemplatesSection } from '@/components/MessageTemplatesSection';
import { api } from '@/lib/api';
import { useCan } from '@/lib/use-permissions';
import { cn } from '@/lib/cn';
import { useTheme, type ThemePref } from '@/lib/theme';
import {
  BRAND_PRESETS,
  DEFAULT_APPEARANCE,
  DENSITY_LABELS,
  RADIUS_LABELS,
  STYLE_LABELS,
  FONT_LABELS,
  BG_LABELS,
  applyToHtml,
  normalizeAppearance,
  saveCached,
  useUpdateAppearance,
  type Appearance,
  type BrandPreset,
  type Density,
  type Radius,
  type StylePreset,
  type FontPreset,
  type BgPreset,
} from '@/lib/appearance';

interface MeResponse {
  user: { userId: string; tenantId: string; email: string; role: string };
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    createdAt: string;
    appearance?: unknown;
  };
}

export default function SettingsPage() {
  const can = useCan();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-ink-muted text-sm">Informações da pousada e preferências de aparência.</p>
      </header>

      {isLoading && <div className="text-ink-muted">Carregando…</div>}

      {data && (
        <div className="space-y-4">
          {can('settings:manage') && (
            <AppearanceSection serverAppearance={data.tenant.appearance} />
          )}

          <section className="surface-card p-5">
            <h2 className="font-semibold text-ink mb-3">Pousada</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="Nome" value={data.tenant.name} />
              <InfoRow label="Slug" value={data.tenant.slug} />
              <InfoRow label="Plano" value={data.tenant.plan} capitalize />
              <InfoRow label="Status" value={data.tenant.status} capitalize />
              <InfoRow
                label="Criada em"
                value={new Date(data.tenant.createdAt).toLocaleDateString('pt-BR')}
              />
              <InfoRow label="ID interno" value={data.tenant.id} mono />
            </dl>
          </section>

          {data.user.role === 'owner' && <SubscriptionSection />}

          <section className="surface-card p-5">
            <h2 className="font-semibold text-ink mb-3">Sua conta</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="Email" value={data.user.email} />
              <InfoRow label="Função" value={data.user.role} capitalize />
              <InfoRow label="ID de usuário" value={data.user.userId} mono />
            </dl>
          </section>

          {can('settings:manage') && <MessageTemplatesSection />}

          {can('settings:manage') && <PagamentosSettings />}

          <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            <strong>Em construção:</strong> edição de dados, gerenciamento de usuários e integrações
            de pagamento (Pix/Stripe) virão nas próximas iterações.
          </section>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   APARÊNCIA
   ============================================================ */

function AppearanceSection({ serverAppearance }: { serverAppearance: unknown }) {
  const { preference: themePref, setTheme } = useTheme();
  const update = useUpdateAppearance();
  const initial = normalizeAppearance(serverAppearance);
  const [draft, setDraft] = useState<Appearance>(initial);
  const [dirty, setDirty] = useState(false);

  // Quando o /me carrega/atualiza, reseta o rascunho (a menos que o usuário esteja editando)
  useEffect(() => {
    if (!dirty) setDraft(normalizeAppearance(serverAppearance));
  }, [serverAppearance, dirty]);

  function patch(p: Partial<Appearance>) {
    const next = { ...draft, ...p };
    setDraft(next);
    setDirty(true);
    // Preview ao vivo
    applyToHtml(next);
    saveCached(next);
  }

  async function save() {
    try {
      await update.mutateAsync(draft);
      setDirty(false);
      toast.success('Aparência atualizada');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar';
      toast.error(msg);
    }
  }

  function reset() {
    setDraft(DEFAULT_APPEARANCE);
    setDirty(true);
    applyToHtml(DEFAULT_APPEARANCE);
    saveCached(DEFAULT_APPEARANCE);
  }

  return (
    <section className="surface-card p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-semibold text-ink">Aparência</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Personalize cor, densidade e cantos do sistema. As mudanças são salvas no perfil da pousada.
          </p>
        </div>
        <button onClick={reset} className="btn-ghost text-xs">
          Restaurar padrão
        </button>
      </div>

      <div className="space-y-5">
        {/* Tema */}
        <Field label="Tema">
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as ThemePref[]).map((t) => {
              const active = themePref === t;
              const Icon = t === 'light' ? Sun : t === 'dark' ? Moon : Monitor;
              const label = t === 'light' ? 'Claro' : t === 'dark' ? 'Escuro' : 'Sistema';
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
                      : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-muted mt-2">
            "Sistema" segue a preferência do seu dispositivo. Salvo apenas no navegador.
          </p>
        </Field>

        {/* Cor primária */}
        <Field label="Cor primária">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(Object.keys(BRAND_PRESETS) as BrandPreset[]).map((key) => {
              const meta = BRAND_PRESETS[key];
              const active = draft.brand === key;
              return (
                <button
                  key={key}
                  onClick={() => patch({ brand: key })}
                  className={cn(
                    'group relative flex flex-col items-center gap-1.5 p-2 rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-surface-sunken'
                      : 'border-line hover:border-brand-400/40 hover:bg-surface-sunken/60',
                  )}
                  aria-pressed={active}
                  aria-label={meta.label}
                >
                  <span
                    className="w-9 h-9 rounded-full shadow-inner-soft border border-black/10 flex items-center justify-center"
                    style={{ background: meta.hex }}
                  >
                    {active && <Check className="w-4 h-4 text-white drop-shadow" />}
                  </span>
                  <span className="text-[11px] font-medium text-ink-soft group-hover:text-ink">
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Densidade */}
        <Field label="Densidade">
          <div className="flex gap-2">
            {(['compact', 'normal', 'comfortable'] as Density[]).map((d) => {
              const active = draft.density === d;
              return (
                <button
                  key={d}
                  onClick={() => patch({ density: d })}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
                      : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
                  )}
                >
                  {DENSITY_LABELS[d]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-muted mt-2">
            Compacta encaixa mais informação na tela; confortável aumenta tudo um pouco.
          </p>
        </Field>

        {/* Raio */}
        <Field label="Cantos">
          <div className="flex gap-2">
            {(['sharp', 'default', 'soft'] as Radius[]).map((r) => {
              const active = draft.radius === r;
              const previewRadius = r === 'sharp' ? '4px' : r === 'default' ? '10px' : '16px';
              return (
                <button
                  key={r}
                  onClick={() => patch({ radius: r })}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
                      : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
                  )}
                >
                  <span
                    className="inline-block w-4 h-4 border-2 border-current"
                    style={{ borderRadius: previewRadius }}
                  />
                  {RADIUS_LABELS[r]}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Estilo */}
        <Field label="Estilo">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(STYLE_LABELS) as StylePreset[]).map((s) => {
              const active = draft.style === s;
              return (
                <button
                  key={s}
                  onClick={() => patch({ style: s })}
                  className={cn(
                    'px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
                      : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
                  )}
                >
                  {STYLE_LABELS[s]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-muted mt-2">
            Muda profundidade e superfícies do sistema. "Vidro" usa efeito translúcido.
          </p>
        </Field>

        {/* Fonte */}
        <Field label="Fonte">
          <div className="flex gap-2">
            {(Object.keys(FONT_LABELS) as FontPreset[]).map((fk) => {
              const active = draft.font === fk;
              return (
                <button
                  key={fk}
                  onClick={() => patch({ font: fk })}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
                      : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
                  )}
                >
                  {FONT_LABELS[fk]}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Fundo */}
        <Field label="Fundo">
          <div className="flex gap-2">
            {(Object.keys(BG_LABELS) as BgPreset[]).map((bk) => {
              const active = draft.bg === bk;
              return (
                <button
                  key={bk}
                  onClick={() => patch({ bg: bk })}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
                      : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
                  )}
                >
                  {BG_LABELS[bk]}
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-line-soft">
        <div className="text-xs text-ink-muted">
          {dirty ? (
            <span className="text-amber-600">Você tem mudanças não salvas no servidor.</span>
          ) : (
            <span>Sincronizado com a pousada.</span>
          )}
        </div>
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="btn-primary text-sm"
        >
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </section>
  );
}

/* ============================================================
   ASSINATURA
   ============================================================ */

interface SubStatusResponse {
  status: 'active' | 'past_due' | 'cancelled' | 'pending' | null;
  currentPeriodEnd?: string;
  planAmount?: string | number;
}

const SUB_STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  cancelled: 'Cancelada',
  pending: 'Pendente',
};

function SubscriptionSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<SubStatusResponse>('/subscriptions/status'),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; accessUntil: string | null }>('/subscriptions/cancel', {
        method: 'POST',
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      const until = res.accessUntil ? new Date(res.accessUntil).toLocaleDateString('pt-BR') : null;
      toast.success(
        until ? `Assinatura cancelada. Seu acesso continua até ${until}.` : 'Assinatura cancelada.',
      );
    },
    onError: (err: Error) => toast.error(err.message || 'Falha ao cancelar'),
  });

  const fmt = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—';

  const amount =
    data?.planAmount != null
      ? Number(data.planAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;

  const canCancel =
    data?.status === 'active' || data?.status === 'past_due' || data?.status === 'pending';

  function onCancel() {
    const until = data?.currentPeriodEnd
      ? new Date(data.currentPeriodEnd).toLocaleDateString('pt-BR')
      : null;
    if (
      !window.confirm(
        `Cancelar a assinatura da pousada?\n\n` +
          `A cobrança recorrente para imediatamente. ` +
          (until
            ? `Seu acesso continua até ${until} (fim do período já pago).`
            : 'Seu acesso será encerrado ao fim do período pago.') +
          `\n\nPara voltar a usar depois, será preciso assinar novamente.`,
      )
    )
      return;
    cancel.mutate();
  }

  return (
    <section className="surface-card p-5">
      <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-brand-600" /> Assinatura
      </h2>

      {isLoading && <div className="text-sm text-ink-muted">Carregando…</div>}

      {data && !isLoading && (
        <>
          {data.status === null ? (
            <p className="text-sm text-ink-muted">
              Nenhuma assinatura encontrada para esta pousada.
            </p>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="Plano" value={amount ? `${amount}/mês` : '—'} />
              <InfoRow label="Situação" value={SUB_STATUS_LABEL[data.status] ?? data.status} />
              <InfoRow
                label={data.status === 'cancelled' ? 'Acesso até' : 'Próxima cobrança'}
                value={fmt(data.currentPeriodEnd)}
              />
            </dl>
          )}

          {data.status === 'cancelled' && (
            <div className="mt-3 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Assinatura cancelada — a cobrança não será renovada. O acesso fica disponível até{' '}
                {fmt(data.currentPeriodEnd)}.
              </span>
            </div>
          )}

          {canCancel && (
            <div className="mt-4 pt-4 border-t border-line-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">
                Ao cancelar, a cobrança para na hora e o acesso continua até o fim do período já
                pago.
              </p>
              <button
                onClick={onCancel}
                disabled={cancel.isPending}
                className="text-sm px-4 py-2 rounded-[var(--radius-control)] border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {cancel.isPending ? 'Cancelando…' : 'Cancelar assinatura'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ============================================================
   PAGAMENTOS — termos exibidos no link de pagamento
   ============================================================ */

function PagamentosSettings() {
  const qc = useQueryClient();
  const [terms, setTerms] = useState('');
  const [lgpd, setLgpd] = useState('');
  const [autoWa, setAutoWa] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () =>
      api<{
        payment_terms_of_service: string;
        payment_lgpd_consent: string;
        payment_link_auto_whatsapp: string;
      }>('/configuracoes'),
  });

  useEffect(() => {
    if (data && !loaded) {
      setTerms(data.payment_terms_of_service);
      setLgpd(data.payment_lgpd_consent);
      setAutoWa(data.payment_link_auto_whatsapp === 'true');
      setLoaded(true);
    }
  }, [data, loaded]);

  const save = useMutation({
    mutationFn: async () => {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'payment_terms_of_service', value: terms }),
      });
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'payment_lgpd_consent', value: lgpd }),
      });
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'payment_link_auto_whatsapp', value: String(autoWa) }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Configurações de pagamento salvas');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', { description: err.message }),
  });

  return (
    <section className="surface-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-ink flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-brand-600" /> Pagamentos
        </h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Termos exibidos ao hóspede na página do link de pagamento.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-muted">Carregando…</div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Termos de Uso e Serviço</label>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={4}
              maxLength={5000}
              className="input-base w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Termo de LGPD</label>
            <textarea
              value={lgpd}
              onChange={(e) => setLgpd(e.target.value)}
              rows={4}
              maxLength={5000}
              className="input-base w-full text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={autoWa}
              onChange={(e) => setAutoWa(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            Enviar link por WhatsApp automaticamente por padrão
          </label>

          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-ink-muted">{label}</dt>
      <dd
        className={`mt-0.5 ${mono ? 'font-mono text-xs' : ''} ${capitalize ? 'capitalize' : ''} text-ink`}
      >
        {value}
      </dd>
    </div>
  );
}
