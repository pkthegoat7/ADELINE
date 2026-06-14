'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MessageSquare, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';

type TemplateType =
  | 'checkin_tomorrow'
  | 'post_checkout'
  | 'pending_registration'
  | 'registration_link'
  | 'password_reset';

interface ResolvedTemplate {
  type: TemplateType;
  body: string;
  enabled: boolean;
  hourBrt: number | null;
  isCustom: boolean;
  default: {
    body: string;
    hourBrt: number | null;
    vars: Record<string, string>;
    label: string;
    trigger: string;
  };
}

const SCHEDULED: TemplateType[] = [
  'checkin_tomorrow',
  'post_checkout',
  'pending_registration',
];

export function MessageTemplatesSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp', 'templates'],
    queryFn: () => api<ResolvedTemplate[]>('/whatsapp/templates'),
  });

  const update = useMutation({
    mutationFn: ({
      type,
      patch,
    }: {
      type: TemplateType;
      patch: { body?: string; enabled?: boolean; hourBrt?: number | null };
    }) =>
      api<ResolvedTemplate>(`/whatsapp/templates/${type}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp', 'templates'] }),
    onError: (err: Error) => toast.error('Falha ao salvar', err.message),
  });

  const reset = useMutation({
    mutationFn: (type: TemplateType) =>
      api<ResolvedTemplate>(`/whatsapp/templates/${type}/reset`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp', 'templates'] });
      toast.success('Mensagem restaurada ao padrão.');
    },
    onError: (err: Error) => toast.error('Falha ao restaurar', err.message),
  });

  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-brand-500 mt-0.5" />
        <div>
          <h2 className="font-semibold text-ink">Mensagens do WhatsApp</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Personalize o texto que seus hóspedes recebem. Use {'{variaveis}'} para inserir
            dados da reserva — o sistema substitui automaticamente.
          </p>
        </div>
      </div>

      {isLoading && <div className="text-ink-muted text-sm">Carregando mensagens…</div>}

      <div className="space-y-3">
        {data?.map((tpl) => (
          <TemplateCard
            key={tpl.type}
            template={tpl}
            onSave={(patch) => update.mutateAsync({ type: tpl.type, patch })}
            onReset={() => reset.mutateAsync(tpl.type)}
            saving={update.isPending && update.variables?.type === tpl.type}
            resetting={reset.isPending && reset.variables === tpl.type}
          />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({
  template,
  onSave,
  onReset,
  saving,
  resetting,
}: {
  template: ResolvedTemplate;
  onSave: (patch: { body?: string; enabled?: boolean; hourBrt?: number | null }) => Promise<unknown>;
  onReset: () => Promise<unknown>;
  saving: boolean;
  resetting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(template.body);
  const [hourBrt, setHourBrt] = useState<number | null>(template.hourBrt);

  // Sincroniza o draft quando os dados do servidor mudam (após salvar/restaurar)
  useEffect(() => {
    setBody(template.body);
    setHourBrt(template.hourBrt);
  }, [template.body, template.hourBrt]);

  const isScheduled = SCHEDULED.includes(template.type);
  const dirty = body !== template.body || hourBrt !== template.hourBrt;

  const preview = useMemo(() => renderPreview(body, template.default.vars), [body, template.default.vars]);

  async function handleSave() {
    try {
      await onSave({ body, hourBrt: isScheduled ? hourBrt : null });
      toast.success('Mensagem salva.');
    } catch {
      /* toast já tratado */
    }
  }

  async function handleToggle(enabled: boolean) {
    try {
      await onSave({ enabled });
    } catch {
      /* toast já tratado */
    }
  }

  return (
    <div className="border border-line rounded-[var(--radius-control)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-sunken/60"
      >
        <span
          className={cn(
            'inline-block w-2 h-2 rounded-full flex-shrink-0',
            template.enabled ? 'bg-green-500' : 'bg-ink-muted/40',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink truncate">{template.default.label}</div>
          <div className="text-[11px] text-ink-muted truncate">{template.default.trigger}</div>
        </div>
        {isScheduled && template.enabled && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <Clock className="w-3 h-3" />
            {String(template.hourBrt ?? 0).padStart(2, '0')}:00
          </span>
        )}
        {template.isCustom && (
          <span className="text-[10px] uppercase tracking-wider text-brand-500 font-semibold">
            personalizada
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-line p-4 space-y-4 bg-surface-sunken/30">
          <div className="flex items-center justify-between">
            <label className="text-sm flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.enabled}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <span>Enviar esta mensagem automaticamente</span>
            </label>
            {isScheduled && (
              <label className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-ink-muted" />
                Hora (BRT):
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hourBrt ?? 0}
                  onChange={(e) => setHourBrt(Math.max(0, Math.min(23, Number(e.target.value))))}
                  className="w-16 px-2 py-1 border border-line rounded text-sm"
                />
              </label>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted block mb-1">
              Texto
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.max(6, body.split('\n').length + 1)}
              className="w-full px-3 py-2 border border-line rounded-[var(--radius-control)] text-sm font-mono"
            />
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Variáveis disponíveis
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(template.default.vars).map(([key, desc]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBody((b) => `${b}{${key}}`)}
                  title={desc}
                  className="text-[11px] px-2 py-1 rounded bg-surface-sunken border border-line hover:border-brand-400 font-mono"
                >
                  {'{' + key + '}'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted mt-1">
              Clique para inserir no final do texto.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Pré-visualização
            </div>
            <div className="text-sm whitespace-pre-wrap bg-white dark:bg-black/30 border border-line rounded-[var(--radius-control)] p-3 text-ink">
              {preview}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-line-soft">
            <button
              type="button"
              onClick={() => onReset()}
              disabled={resetting || !template.isCustom}
              className="btn-ghost text-xs inline-flex items-center gap-1"
              title={template.isCustom ? '' : 'Já está no padrão'}
            >
              <RotateCcw className="w-3 h-3" />
              {resetting ? 'Restaurando…' : 'Restaurar padrão'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="btn-primary text-sm"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Substitui `{var}` por exemplos legíveis baseados na descrição. */
function renderPreview(body: string, vars: Record<string, string>): string {
  const samples: Record<string, string> = {
    primeiro_nome: 'Maria',
    pousada: 'Pousada Recanto',
    checkin: '15/06',
    codigo_reserva: 'ADL-2026-00042',
    link: 'https://app.adelina/cadastro/abc123',
    intro_reserva: 'Recebemos sua reserva ADL-2026-00042 (check-in 15/06). Pra agilizar sua chegada, ',
    dias: '7',
    email: 'maria@exemplo.com',
    minutos: '30',
  };
  return body.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_, key: string) =>
    samples[key] ?? (vars[key] ? `[${key}]` : `{${key}}`),
  );
}
