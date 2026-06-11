'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ArrowLeft, Building2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';

interface MeResponse {
  user: { isSuperAdmin?: boolean };
}

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  owner: { email: string; fullName: string | null } | null;
  counts: { users: number; properties: number; guests: number; reservations: number };
}

function TenantsList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api<AdminTenant[]>('/admin/tenants'),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      api(`/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Status atualizado');
    },
    onError: (err: Error) => toast.error('Não foi possível atualizar', err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/tenants/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Pousada excluída');
    },
    onError: (err: Error) => toast.error('Não foi possível excluir', err.message),
  });

  function confirmDelete(t: AdminTenant) {
    const typed = prompt(
      `EXCLUIR DEFINITIVAMENTE "${t.name}"?\n\n` +
        `Apaga TUDO: ${t.counts.reservations} reserva(s), ${t.counts.guests} hóspede(s), ` +
        `quartos e os ${t.counts.users} login(s). Não pode ser desfeito.\n\n` +
        `Pra confirmar, digite o identificador da pousada: ${t.slug}`,
    );
    if (typed === null) return;
    if (typed.trim() !== t.slug) {
      toast.error('Identificador não confere', 'Exclusão cancelada.');
      return;
    }
    remove.mutate(t.id);
  }

  return (
    <section className="mb-8">
      <h2 className="font-semibold text-ink flex items-center gap-2 mb-3">
        <Building2 className="w-4 h-4 text-brand-600" />
        Pousadas cadastradas
        {data && <span className="text-xs text-ink-muted font-normal">({data.length})</span>}
      </h2>

      {isLoading && <div className="text-sm text-ink-muted">Carregando…</div>}

      {data && (
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken/60 border-b border-line text-ink-muted text-[10px] uppercase tracking-[0.18em]">
              <tr>
                <th className="text-left p-3 font-semibold">Pousada</th>
                <th className="text-left p-3 font-semibold">Dono</th>
                <th className="text-left p-3 font-semibold">Uso</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-right p-3 font-semibold w-28">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t, idx) => (
                <tr
                  key={t.id}
                  className={cn(
                    'border-b border-line-soft last:border-0',
                    idx % 2 === 1 && 'bg-surface-sunken/20',
                    t.status !== 'active' && 'opacity-60',
                  )}
                >
                  <td className="p-3">
                    <div className="font-medium text-ink">{t.name}</div>
                    <div className="text-xs text-ink-muted font-mono">{t.slug}</div>
                  </td>
                  <td className="p-3 text-ink-soft">
                    <div>{t.owner?.fullName ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{t.owner?.email}</div>
                  </td>
                  <td className="p-3 text-xs text-ink-muted num-tabular">
                    {t.counts.reservations} reservas · {t.counts.guests} hóspedes ·{' '}
                    {t.counts.users} logins
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        t.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                      )}
                    >
                      {t.status === 'active' ? 'Ativa' : 'Suspensa'}
                    </span>
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() =>
                          patch.mutate({
                            id: t.id,
                            status: t.status === 'active' ? 'suspended' : 'active',
                          })
                        }
                        disabled={patch.isPending}
                        data-tip={t.status === 'active' ? 'Suspender (bloqueia logins)' : 'Reativar'}
                        className="p-1.5 text-ink-muted hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md active:scale-95 transition-all"
                      >
                        {t.status === 'active' ? (
                          <PauseCircle className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => confirmDelete(t)}
                        disabled={remove.isPending}
                        data-tip="Excluir definitivamente"
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md active:scale-95 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink-muted text-sm">
                    Nenhuma pousada ainda — cadastre a primeira abaixo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function CadastrarPousadaPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // Verifica se o user atual é super admin
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    propertyName: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    tenantId: string;
    propertyId: string;
    userId: string;
  } | null>(null);

  function setTenantName(v: string) {
    const slug = v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, tenantName: v, tenantSlug: f.tenantSlug || slug }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api<{ tenantId: string; propertyId: string; userId: string }>(
        '/auth/signup-tenant',
        {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            fullName: form.fullName,
            tenantName: form.tenantName,
            tenantSlug: form.tenantSlug,
            propertyName: form.propertyName,
          }),
        },
      );
      setCreated(result);
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      setForm({
        tenantName: '',
        tenantSlug: '',
        propertyName: '',
        fullName: '',
        email: '',
        password: '',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (me.isLoading) {
    return <div className="p-6 text-ink-muted">Verificando permissões…</div>;
  }

  if (!me.data?.user.isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto bg-amber-50 border border-amber-300 rounded-lg p-6 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-amber-600" />
          <h2 className="font-semibold text-amber-900">Acesso restrito</h2>
          <p className="text-sm text-amber-900">
            Esta página é exclusiva pra super admins do sistema. Sua conta não tem essa permissão.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-amber-900 hover:underline"
          >
            ← Voltar pro dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted hover:text-ink flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </Link>
        <h1 className="text-2xl font-bold">Pousadas</h1>
        <p className="text-ink-muted text-sm">
          Gerencie as pousadas do sistema e cadastre novas. Apenas super admins veem esta página.
        </p>
      </header>

      <TenantsList />

      {created && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 mb-4 space-y-2">
          <div className="text-sm text-emerald-900 font-medium">✓ Pousada criada com sucesso</div>
          <div className="text-xs text-emerald-800 font-mono space-y-0.5">
            <div>tenantId: {created.tenantId}</div>
            <div>propertyId: {created.propertyId}</div>
            <div>userId: {created.userId}</div>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="text-xs text-emerald-900 underline hover:text-emerald-700"
          >
            Cadastrar outra
          </button>
        </div>
      )}

      <h2 className="font-semibold text-ink mb-3">Cadastrar nova pousada</h2>
      <form
        onSubmit={onSubmit}
        className="surface-card p-6 space-y-4"
      >
        <fieldset className="space-y-3">
          <legend className="text-xs uppercase text-ink-muted font-medium pb-2">Pousada</legend>

          <div>
            <label className="text-xs font-medium text-ink-soft">Nome da pousada</label>
            <input
              type="text"
              required
              value={form.tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="input-base mt-1"
              placeholder="Pousada do Sol"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">Identificador (slug)</label>
            <input
              type="text"
              required
              minLength={3}
              pattern="[a-z0-9-]+"
              value={form.tenantSlug}
              onChange={(e) =>
                setForm({
                  ...form,
                  // Sanitiza enquanto digita: acento some, underline/espaço viram hífen
                  tenantSlug: e.target.value
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[̀-ͯ]/g, '')
                    .replace(/[_\s]+/g, '-')
                    .replace(/[^a-z0-9-]/g, ''),
                })
              }
              className="input-base mt-1 font-mono lowercase"
              placeholder="pousada-do-sol"
            />
            <p className="text-xs text-ink-muted mt-0.5">
              mínimo 3 caracteres; só minúsculas, números e hífens
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">Nome do estabelecimento</label>
            <input
              type="text"
              required
              value={form.propertyName}
              onChange={(e) => setForm({ ...form, propertyName: e.target.value })}
              className="input-base mt-1"
              placeholder="Sede / Unidade principal"
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-line-soft pt-4">
          <legend className="text-xs uppercase text-ink-muted font-medium pb-2">
            Dono da pousada (owner)
          </legend>

          <div>
            <label className="text-xs font-medium text-ink-soft">Nome completo</label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="input-base mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-base mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">Senha inicial</label>
            <input
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input-base mt-1 font-mono"
            />
            <p className="text-xs text-ink-muted mt-0.5">
              mínimo 8 caracteres. O dono troca depois pelo "Esqueci senha".
            </p>
          </div>
        </fieldset>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Criando…' : 'Cadastrar pousada'}
        </button>
      </form>
    </div>
  );
}
