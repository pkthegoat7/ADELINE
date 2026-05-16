'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
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

  const { data, isLoading } = useQuery({
    queryKey: ['guests', search],
    queryFn: () => api<Guest[]>(`/guests${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hóspedes</h1>
          <p className="text-stone-500 text-sm">{data?.length ?? 0} resultados</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 active:scale-95 shadow-soft"
        >
          <Plus className="w-4 h-4" />
          Novo hóspede
        </button>
      </header>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          placeholder="Buscar por nome, documento, email, telefone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
        />
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left p-3 font-semibold">Nome</th>
                <th className="text-left p-3 font-semibold">Documento</th>
                <th className="text-left p-3 font-semibold">Email</th>
                <th className="text-left p-3 font-semibold">Telefone</th>
                <th className="text-left p-3 font-semibold">Nacionalidade</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60 transition-colors"
                >
                  <td className="p-3 font-medium">{g.fullName}</td>
                  <td className="p-3 text-stone-600">
                    {g.document ? `${g.documentType.toUpperCase()}: ${g.document}` : '—'}
                  </td>
                  <td className="p-3 text-stone-600">{g.email ?? '—'}</td>
                  <td className="p-3 text-stone-600">{g.phone ?? '—'}</td>
                  <td className="p-3 text-stone-600">{g.nationality ?? '—'}</td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-stone-400">
                    <div className="inline-flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
                        <Search className="w-5 h-5 text-stone-400" />
                      </div>
                      Nenhum hóspede encontrado.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
            className={INPUT}
          />
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Tipo">
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
              className={INPUT}
            >
              <option value="cpf">CPF</option>
              <option value="rg">RG</option>
              <option value="passport">Passaporte</option>
              <option value="cnh">CNH</option>
              <option value="other">Outro</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Documento">
              <input
                type="text"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
        </div>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </Field>

        <Field label="Telefone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT}
          />
        </Field>

        <Field label="Nacionalidade">
          <input
            type="text"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="BR, US, AR…"
            className={INPUT}
          />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 -mx-5 px-5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="px-4 py-2 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {create.isPending && <Spinner size={14} />}
            {create.isPending ? 'Salvando…' : 'Criar hóspede'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const INPUT =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
