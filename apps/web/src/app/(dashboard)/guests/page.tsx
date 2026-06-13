'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Trash2 } from 'lucide-react';
import { SendRegistrationLinkModal } from '@/components/SendRegistrationLinkModal';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface Guest {
  id: string;
  fullName: string;
  documentType: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
}

export default function GuestsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['guests', search],
    queryFn: () => api<Guest[]>(`/guests${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/guests/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guests'] });
      toast.success('Hóspede excluído');
    },
    onError: (err: Error) => toast.error('Não foi possível excluir', err.message),
  });

  function confirmRemove(g: Guest) {
    if (
      confirm(
        `EXCLUIR DEFINITIVAMENTE ${g.fullName}?\n\n` +
          `O cadastro some do sistema. Se houver reservas vinculadas, a exclusão será bloqueada.\n\n` +
          `Essa ação não pode ser desfeita.`,
      )
    ) {
      remove.mutate(g.id);
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Cadastro</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Hóspedes</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">{data?.length ?? 0} resultados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLinkModalOpen(true)} className="btn-secondary">
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            Enviar link de cadastro
          </button>
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Novo hóspede
          </button>
        </div>
      </header>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          placeholder="Buscar por nome, documento, email, telefone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-base pl-9"
        />
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : (
        <div className="surface-card shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken/60 border-b border-line text-ink-muted text-[10px] uppercase tracking-[0.18em]">
                <tr>
                  <th className="text-left p-3 font-semibold">Nome</th>
                  <th className="text-left p-3 font-semibold">Documento</th>
                  <th className="text-left p-3 font-semibold">Email</th>
                  <th className="text-left p-3 font-semibold">Telefone</th>
                  <th className="text-left p-3 font-semibold">Nacionalidade</th>
                  <th className="text-right p-3 font-semibold w-16">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((g, idx) => (
                  <tr
                    key={g.id}
                    className={cn(
                      'border-b border-line-soft last:border-0 hover:bg-brand-50/40 dark:hover:bg-brand-900/10 transition-colors',
                      idx % 2 === 1 && 'bg-surface-sunken/20',
                    )}
                  >
                    <td className="p-3 font-medium text-ink">{g.fullName}</td>
                    <td className="p-3 text-ink-soft">
                      {g.document ? `${g.documentType.toUpperCase()}: ${g.document}` : '—'}
                    </td>
                    <td className="p-3 text-ink-soft">{g.email ?? '—'}</td>
                    <td className="p-3 text-ink-soft">{g.phone ?? '—'}</td>
                    <td className="p-3 text-ink-soft">{g.nationality ?? '—'}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => confirmRemove(g)}
                        disabled={remove.isPending}
                        data-tip="Excluir hóspede"
                        className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {remove.isPending && remove.variables === g.id ? (
                          <Spinner size={14} />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
                {data?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-ink-muted">
                      <div className="inline-flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center">
                          <Search className="w-5 h-5 text-ink-muted" />
                        </div>
                        Nenhum hóspede encontrado.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewGuestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['guests'] });
          setModalOpen(false);
        }}
      />

      <SendRegistrationLinkModal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} />
    </div>
  );
}

function NewGuestModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] = useState<'cpf' | 'rg' | 'passport' | 'cnh' | 'other'>(
    'cpf',
  );
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationality, setNationality] = useState('BR');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!fullName.trim()) throw new Error('Nome obrigatório');
      return api('/guests', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          documentType,
          document: document.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          nationality: nationality.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast.success('Hóspede cadastrado');
      onCreated();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Novo hóspede" size="md">
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

        <div className="grid grid-cols-3 gap-2">
          <Field label="Tipo">
            <Select
              value={documentType}
              onChange={(v) => setDocumentType(v as typeof documentType)}
              options={[
                { value: 'cpf', label: 'CPF' },
                { value: 'rg', label: 'RG' },
                { value: 'passport', label: 'Passaporte' },
                { value: 'cnh', label: 'CNH' },
                { value: 'other', label: 'Outro' },
              ]}
              className="w-full"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Documento">
              <input
                type="text"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                className="input-base"
              />
            </Field>
          </div>
        </div>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
          />
        </Field>

        <Field label="Telefone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-base"
          />
        </Field>

        <Field label="Nacionalidade">
          <input
            type="text"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="BR, US, AR…"
            className="input-base"
          />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-line-soft -mx-5 px-5 mt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending && <Spinner size={14} />}
            {create.isPending ? 'Salvando…' : 'Criar hóspede'}
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
