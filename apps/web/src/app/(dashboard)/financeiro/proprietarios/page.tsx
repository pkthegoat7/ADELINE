'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/use-permissions';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { toast } from '@/lib/toast';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface Owner {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  pixKey: string | null;
  bankInfo: string | null;
  notes: string | null;
  active: boolean;
  _count: { properties: number };
}

interface Property {
  id: string;
  name: string;
  ownerId: string | null;
  mgmtCommissionPercent: string; // Decimal serializado como string
  mgmtMonthlyFee: string;        // Decimal serializado como string
}

/* ─── Página principal ───────────────────────────────────────────────────── */

export default function ProprietariosPage() {
  const qc = useQueryClient();
  const can = useCan();

  if (!can('owner:read')) {
    return (
      <div className="p-8 text-ink-muted">
        Você não tem acesso a esta área.
      </div>
    );
  }

  const editable = can('owner:manage');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Owner | null>(null);

  const { data: owners, isLoading: ownersLoading } = useQuery({
    queryKey: ['owners'],
    queryFn: () => api<Owner[]>('/owners'),
  });

  const { data: properties, isLoading: propertiesLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api<Property[]>('/properties'),
  });

  const invalidateOwners = () => {
    qc.invalidateQueries({ queryKey: ['owners'] });
  };

  const removeOwner = useMutation({
    mutationFn: (id: string) => api(`/owners/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOwners();
      toast.success('Proprietário excluído');
    },
    onError: (e: Error) => toast.error('Não foi possível excluir', e.message),
  });

  const ownerOptions = [
    { value: '', label: '— Sem proprietário —' },
    ...(owners?.map((o) => ({ value: o.id, label: o.name })) ?? []),
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8 max-w-[1400px]">
      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Financeiro</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Proprietários</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">
            {owners?.length ?? 0} cadastrados
          </p>
        </div>
        {editable && (
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Novo proprietário
          </button>
        )}
      </header>

      {/* Tabela de proprietários */}
      <section className="space-y-3">
        {ownersLoading ? (
          <SkeletonTable />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-muted border-b border-line">
                <tr>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Contato</th>
                  <th className="px-3 py-2 font-medium">Pix / Banco</th>
                  <th className="px-3 py-2 font-medium text-center">Imóveis</th>
                  {editable && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {owners?.length ? (
                  owners.map((o) => (
                    <tr key={o.id} className="border-b border-line/60 hover:bg-surface-2/40">
                      <td className="px-3 py-2 font-medium text-ink">{o.name}</td>
                      <td className="px-3 py-2 text-ink-muted num-tabular">
                        {o.document ?? <span className="italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {o.email && <div>{o.email}</div>}
                        {o.phone && <div>{o.phone}</div>}
                        {!o.email && !o.phone && <span className="italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {o.pixKey && <div className="num-tabular">{o.pixKey}</div>}
                        {o.bankInfo && (
                          <div className="text-xs text-ink-muted truncate max-w-[180px]" title={o.bankInfo}>
                            {o.bankInfo}
                          </div>
                        )}
                        {!o.pixKey && !o.bankInfo && <span className="italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center num-tabular">{o._count.properties}</td>
                      {editable && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              title="Editar"
                              onClick={() => {
                                setEditing(o);
                                setModalOpen(true);
                              }}
                              className="p-1 text-ink-muted hover:bg-surface-2 rounded"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              title="Excluir"
                              onClick={() =>
                                confirm(`Excluir o proprietário "${o.name}"?`) &&
                                removeOwner.mutate(o.id)
                              }
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={editable ? 6 : 5}
                      className="px-3 py-8 text-center text-ink-muted"
                    >
                      Nenhum proprietário cadastrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Seção de imóveis administrados */}
      <section className="space-y-3">
        <h3 className="font-serif text-lg text-ink">Imóveis administrados</h3>
        <p className="text-sm text-ink-muted">
          Vincule imóveis a proprietários e defina os termos de administração.
        </p>
        {propertiesLoading ? (
          <SkeletonTable />
        ) : properties?.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-muted border-b border-line">
                <tr>
                  <th className="px-3 py-2 font-medium">Imóvel</th>
                  <th className="px-3 py-2 font-medium">Proprietário</th>
                  <th className="px-3 py-2 font-medium">Comissão (%)</th>
                  <th className="px-3 py-2 font-medium">Taxa fixa (R$)</th>
                  {editable && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <PropertyRow
                    key={p.id}
                    property={p}
                    ownerOptions={ownerOptions}
                    editable={editable}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ['properties'] });
                      qc.invalidateQueries({ queryKey: ['owners'] });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-line px-3 py-8 text-center text-ink-muted text-sm">
            Nenhum imóvel cadastrado.
          </div>
        )}
      </section>

      {/* Modal criar/editar proprietário */}
      {modalOpen && (
        <OwnerModal
          owner={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            invalidateOwners();
          }}
        />
      )}
    </div>
  );
}

/* ─── Linha de imóvel (estado local por linha) ───────────────────────────── */

function PropertyRow({
  property,
  ownerOptions,
  editable,
  onSaved,
}: {
  property: Property;
  ownerOptions: { value: string; label: string }[];
  editable: boolean;
  onSaved: () => void;
}) {
  const [ownerId, setOwnerId] = useState(property.ownerId ?? '');
  const [pct, setPct] = useState(String(Number(property.mgmtCommissionPercent)));
  const [fee, setFee] = useState(String(Number(property.mgmtMonthlyFee)));

  const save = useMutation({
    mutationFn: () =>
      api(`/properties/${property.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ownerId: ownerId || null,
          mgmtCommissionPercent: Number(pct),
          mgmtMonthlyFee: Number(fee),
        }),
      }),
    onSuccess: () => {
      onSaved();
      toast.success('Imóvel atualizado');
    },
    onError: (e: Error) => toast.error('Não foi possível salvar', e.message),
  });

  return (
    <tr className="border-b border-line/60 hover:bg-surface-2/40">
      <td className="px-3 py-2 font-medium text-ink">{property.name}</td>
      <td className="px-3 py-2 min-w-[200px]">
        {editable ? (
          <Select value={ownerId} onChange={setOwnerId} options={ownerOptions} />
        ) : (
          <span className="text-ink-muted">
            {ownerOptions.find((o) => o.value === (property.ownerId ?? ''))?.label ??
              '— Sem proprietário —'}
          </span>
        )}
      </td>
      <td className="px-3 py-2 w-36">
        {editable ? (
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input-base w-full num-tabular"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        ) : (
          <span className="num-tabular text-ink-muted">{Number(pct).toFixed(2)}%</span>
        )}
      </td>
      <td className="px-3 py-2 w-40">
        {editable ? (
          <input
            type="number"
            step="0.01"
            min="0"
            className="input-base w-full num-tabular"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        ) : (
          <span className="num-tabular text-ink-muted">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
              Number(fee),
            )}
          </span>
        )}
      </td>
      {editable && (
        <td className="px-3 py-2">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-secondary text-xs py-1"
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </td>
      )}
    </tr>
  );
}

/* ─── Modal de proprietário ──────────────────────────────────────────────── */

function OwnerModal({
  owner,
  onClose,
  onSaved,
}: {
  owner: Owner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!owner;
  const [form, setForm] = useState({
    name: owner?.name ?? '',
    document: owner?.document ?? '',
    email: owner?.email ?? '',
    phone: owner?.phone ?? '',
    pixKey: owner?.pixKey ?? '',
    bankInfo: owner?.bankInfo ?? '',
    notes: owner?.notes ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        document: form.document.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        pixKey: form.pixKey.trim() || null,
        bankInfo: form.bankInfo.trim() || null,
        notes: form.notes.trim() || null,
      };
      return isEdit
        ? api(`/owners/${owner!.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/owners', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Proprietário atualizado' : 'Proprietário criado');
      onSaved();
    },
    onError: (e: Error) => toast.error('Não foi possível salvar', e.message),
  });

  const valid = form.name.trim().length > 0;

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar proprietário' : 'Novo proprietário'}>
      <div className="space-y-3 px-6 py-5">
        <label className="block">
          <span className="text-xs text-ink-muted">Nome *</span>
          <input
            className="input-base w-full"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={150}
            autoFocus
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-ink-muted">CPF / CNPJ</span>
            <input
              className="input-base w-full num-tabular"
              value={form.document}
              onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
              maxLength={20}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">Telefone</span>
            <input
              className="input-base w-full num-tabular"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              maxLength={20}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-ink-muted">E-mail</span>
          <input
            type="email"
            className="input-base w-full"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            maxLength={150}
          />
        </label>

        <label className="block">
          <span className="text-xs text-ink-muted">Chave Pix</span>
          <input
            className="input-base w-full num-tabular"
            value={form.pixKey}
            onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))}
            maxLength={150}
          />
        </label>

        <label className="block">
          <span className="text-xs text-ink-muted">Dados bancários</span>
          <textarea
            className="input-base w-full resize-none"
            rows={3}
            value={form.bankInfo}
            onChange={(e) => setForm((f) => ({ ...f, bankInfo: e.target.value }))}
            maxLength={500}
          />
        </label>

        <label className="block">
          <span className="text-xs text-ink-muted">Observações</span>
          <textarea
            className="input-base w-full resize-none"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            maxLength={1000}
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
            className="btn-primary"
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
