'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Search } from 'lucide-react';
import { api } from '@/lib/api';

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
          <h1 className="text-2xl font-bold">Hóspedes</h1>
          <p className="text-stone-500 text-sm">{data?.length ?? 0} resultados</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800"
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
          className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-md"
        />
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Documento</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Telefone</th>
              <th className="text-left p-3">Nacionalidade</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="p-6 text-center text-stone-400">Carregando…</td></tr>
            )}
            {data?.map((g) => (
              <tr key={g.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="p-3 font-medium">{g.fullName}</td>
                <td className="p-3 text-stone-600">
                  {g.document ? `${g.documentType.toUpperCase()}: ${g.document}` : '—'}
                </td>
                <td className="p-3 text-stone-600">{g.email ?? '—'}</td>
                <td className="p-3 text-stone-600">{g.phone ?? '—'}</td>
                <td className="p-3 text-stone-600">{g.nationality ?? '—'}</td>
              </tr>
            ))}
            {!isLoading && data?.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-stone-400">Nenhum hóspede.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <NewGuestModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['guests'] });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewGuestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] = useState<'cpf' | 'rg' | 'passport' | 'cnh' | 'other'>('cpf');
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
    onSuccess: onCreated,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold">Novo hóspede</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="p-4 space-y-3"
        >
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Nome completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-stone-700 uppercase">Tipo</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                className="mt-1 w-full px-2 py-2 text-sm border border-stone-300 rounded"
              >
                <option value="cpf">CPF</option>
                <option value="rg">RG</option>
                <option value="passport">Passaporte</option>
                <option value="cnh">CNH</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-stone-700 uppercase">Documento</label>
              <input
                type="text"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Telefone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Nacionalidade</label>
            <input
              type="text"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="BR, US, AR…"
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-50"
            >
              {create.isPending ? 'Salvando…' : 'Criar hóspede'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
