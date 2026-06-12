'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface Member {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  active: boolean;
  createdAt: string;
}

interface Me {
  user: { userId: string; role: string };
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  owner: { label: 'Proprietário', color: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300' },
  manager: { label: 'Gerente', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
  receptionist: { label: 'Recepção', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  housekeeper: { label: 'Governança', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  readonly: { label: 'Somente leitura', color: 'bg-surface-sunken text-ink-muted' },
};

const ASSIGNABLE_ROLES = [
  { value: 'manager', label: 'Gerente' },
  { value: 'receptionist', label: 'Recepção' },
  { value: 'housekeeper', label: 'Governança (limpeza)' },
  { value: 'readonly', label: 'Somente leitura' },
];

export default function EquipePage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const { data, isLoading, error } = useQuery({
    queryKey: ['team'],
    queryFn: () => api<Member[]>('/team'),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/team/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Equipe atualizada');
    },
    onError: (err: Error) => toast.error('Não foi possível atualizar', err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/team/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Usuário excluído', 'Removido definitivamente.');
    },
    onError: (err: Error) => toast.error('Não foi possível excluir', err.message),
  });

  function confirmRemove(m: Member) {
    if (
      confirm(
        `EXCLUIR DEFINITIVAMENTE ${m.fullName ?? m.email}?\n\n` +
          `O login some do sistema. Essa ação não pode ser desfeita.\n\n` +
          `Continuar?`,
      )
    ) {
      remove.mutate(m.id);
    }
  }

  const myId = me?.user.userId;

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1100px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Acessos</span>
          </div>
          <h2 className="font-serif text-3xl tracking-serif text-ink">Equipe</h2>
          <p className="text-sm text-ink-muted mt-1">
            Logins dos funcionários e seus níveis de acesso.
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo usuário
        </button>
      </header>

      {error && (
        <div className="surface-card p-6 text-sm text-ink-muted">
          {String((error as Error).message).includes('403')
            ? 'Apenas proprietário ou gerente acessam esta página.'
            : (error as Error).message}
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={3} cols={5} />
      ) : (
        data && (
          <div className="surface-card overflow-hidden shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken/60 border-b border-line text-ink-muted text-[10px] uppercase tracking-[0.18em]">
                <tr>
                  <th className="text-left p-3 font-semibold">Nome</th>
                  <th className="text-left p-3 font-semibold">Email</th>
                  <th className="text-left p-3 font-semibold">Papel</th>
                  <th className="text-left p-3 font-semibold">Status</th>
                  <th className="text-right p-3 font-semibold w-44">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m, idx) => {
                  const role = ROLE_LABEL[m.role] ?? { label: m.role, color: 'bg-surface-sunken text-ink-muted' };
                  const isSelf = m.id === myId;
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        'border-b border-line-soft last:border-0',
                        idx % 2 === 1 && 'bg-surface-sunken/20',
                        !m.active && 'opacity-50',
                      )}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300">
                            <UserRound className="w-4 h-4" />
                          </span>
                          <span className="font-medium text-ink">
                            {m.fullName ?? '—'}
                            {isSelf && <span className="text-xs text-ink-muted ml-1.5">(você)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-ink-soft">{m.email}</td>
                      <td className="p-3">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', role.color)}>
                          {m.role === 'owner' && <ShieldCheck className="w-3 h-3" />}
                          {role.label}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={cn('text-xs font-medium', m.active ? 'text-emerald-600' : 'text-ink-muted')}>
                          {m.active ? 'Ativo' : 'Desativado'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {!isSelf && m.role !== 'owner' && (
                          <div className="inline-flex items-center gap-1.5">
                            <select
                              value={m.role}
                              onChange={(e) => patch.mutate({ id: m.id, body: { role: e.target.value } })}
                              disabled={patch.isPending}
                              className="input-base !w-auto py-1 text-xs"
                            >
                              {ASSIGNABLE_ROLES.map((r) => (
                                <option key={r.value} value={r.value} className="bg-surface-elevated text-ink">
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => patch.mutate({ id: m.id, body: { active: !m.active } })}
                              disabled={patch.isPending}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                                m.active
                                  ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                                  : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
                              )}
                            >
                              {m.active ? 'Desativar' : 'Reativar'}
                            </button>
                            {!m.active && (
                              <button
                                onClick={() => confirmRemove(m)}
                                disabled={remove.isPending}
                                data-tip="Excluir definitivamente"
                                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {remove.isPending && remove.variables === m.id ? (
                                  <Spinner size={14} />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <NewMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['team'] });
          setModalOpen(false);
        }}
      />
    </div>
  );
}

function NewMemberModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('receptionist');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api('/team', {
        method: 'POST',
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password, role }),
      }),
    onSuccess: () => {
      toast.success('Usuário criado', `${email} já pode entrar no sistema.`);
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('receptionist');
      onCreated();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário da equipe" size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="p-5 space-y-3"
      >
        <Field label="Nome completo">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input-base"
          />
        </Field>

        <Field label="Email (será o login)">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
          />
        </Field>

        <Field label="Senha (mín. 8 caracteres)">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-ink-soft hover:text-ink hover:bg-surface-sunken"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Field label="Papel">
          <select value={role} onChange={(e) => setRole(e.target.value)} className="input-base">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value} className="bg-surface-elevated text-ink">
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-line-soft -mx-5 px-5 mt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending && <Spinner size={14} />}
            {create.isPending ? 'Criando…' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-ink-soft uppercase tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
