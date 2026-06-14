'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { MessageTemplatesSection } from '@/components/MessageTemplatesSection';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useTheme, type ThemePref } from '@/lib/theme';
import {
  BRAND_PRESETS,
  DEFAULT_APPEARANCE,
  DENSITY_LABELS,
  RADIUS_LABELS,
  applyToHtml,
  normalizeAppearance,
  saveCached,
  useUpdateAppearance,
  type Appearance,
  type BrandPreset,
  type Density,
  type Radius,
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
          <AppearanceSection serverAppearance={data.tenant.appearance} />

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

          <section className="surface-card p-5">
            <h2 className="font-semibold text-ink mb-3">Sua conta</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="Email" value={data.user.email} />
              <InfoRow label="Função" value={data.user.role} capitalize />
              <InfoRow label="ID de usuário" value={data.user.userId} mono />
            </dl>
          </section>

          <MessageTemplatesSection />

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
