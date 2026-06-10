'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, MessageCircle, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
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
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['guests', search],
    queryFn: () => api<Guest[]>(`/guests${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Cadastro</span>
          </div>
          <h2 className="font-serif text-3xl tracking-serif text-ink">Hóspedes</h2>
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
        <SkeletonTable rows={5} cols={5} />
      ) : (
        <div className="surface-card overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken/60 border-b border-line text-ink-muted text-[10px] uppercase tracking-[0.18em]">
              <tr>
                <th className="text-left p-3 font-semibold">Nome</th>
                <th className="text-left p-3 font-semibold">Documento</th>
                <th className="text-left p-3 font-semibold">Email</th>
                <th className="text-left p-3 font-semibold">Telefone</th>
                <th className="text-left p-3 font-semibold">Nacionalidade</th>
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
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-ink-muted">
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
      )}

      <NewGuestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['guests'] });
          setModalOpen(false);
        }}
      />

      <SendLinkModal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} />
    </div>
  );
}

interface CreatedLink {
  url: string;
  phone: string;
  sentViaWhatsapp: boolean;
  whatsappError: string | null;
}

function SendLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<CreatedLink>('/guest-links', { method: 'POST', body: JSON.stringify({ phone }) }),
    onSuccess: (res) => {
      setResult(res);
      if (res.sentViaWhatsapp) {
        toast.success('Link enviado por WhatsApp!', `Para ${res.phone}`);
      } else {
        toast.info('Link criado', 'WhatsApp indisponível — copie e envie manualmente.');
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  function close() {
    setPhone('');
    setResult(null);
    setCopied(false);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Enviar link de cadastro" size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm text-ink-muted">
          O hóspede recebe um link pelo WhatsApp pra preencher a própria ficha: dados pessoais,
          documento com foto e acompanhantes.
        </p>

        {!result && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              create.mutate();
            }}
            className="space-y-3"
          >
            <Field label="WhatsApp do hóspede">
              <input
                type="tel"
                required
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className={INPUT}
              />
            </Field>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={create.isPending || phone.replace(/\D/g, '').length < 8}
                className="btn-primary"
              >
                {create.isPending && <Spinner size={14} />}
                {create.isPending ? 'Criando…' : 'Criar e enviar'}
              </button>
            </div>
          </form>
        )}

        {result && (
          <div className="space-y-3">
            <div
              className={`text-sm rounded-lg px-3 py-2.5 border ${
                result.sentViaWhatsapp
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {result.sentViaWhatsapp
                ? `✅ Link enviado por WhatsApp para ${result.phone}.`
                : `⚠ WhatsApp não enviou (${result.whatsappError ?? 'desconectado'}). Copie o link e mande manualmente.`}
            </div>

            <div className="flex gap-1.5">
              <input
                readOnly
                value={result.url}
                onFocus={(e) => e.target.select()}
                className="flex-1 px-2 py-1.5 text-xs font-mono bg-surface-sunken border border-line rounded-md"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(result.url);
                  setCopied(true);
                }}
                className="btn-secondary px-3"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button onClick={close} className="btn-primary">
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
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
