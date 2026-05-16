'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface RoomType {
  id: string;
  name: string;
  code: string;
  capacity: number;
  beds: number;
  basePrice: string;
  description: string | null;
  active: boolean;
}

interface FormState {
  name: string;
  code: string;
  capacity: number;
  beds: number;
  basePrice: string;
  description: string;
}

const EMPTY: FormState = {
  name: '',
  code: '',
  capacity: 2,
  beds: 1,
  basePrice: '',
  description: '',
};

export function RoomTypesModal({
  propertyId,
  open,
  onClose,
}: {
  propertyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ['room-types', propertyId],
    queryFn: () => api<RoomType[]>(`/room-types?propertyId=${propertyId}`),
    enabled: open,
  });

  const isEditing = !!editingId;

  function startEdit(t: RoomType) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      code: t.code,
      capacity: t.capacity,
      beds: t.beds,
      basePrice: t.basePrice,
      description: t.description ?? '',
    });
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  const submit = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('Nome obrigatório');
      if (!form.code.trim()) throw new Error('Código obrigatório');
      if (!form.basePrice || Number(form.basePrice) <= 0) throw new Error('Preço base inválido');

      const body = {
        name: form.name.trim(),
        code: form.code.trim(),
        capacity: form.capacity,
        beds: form.beds,
        basePrice: Number(form.basePrice),
        description: form.description.trim() || undefined,
      };

      if (isEditing) {
        return api(`/room-types/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      return api('/room-types', {
        method: 'POST',
        body: JSON.stringify({ propertyId, ...body }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-types'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(isEditing ? 'Tipo atualizado' : 'Tipo criado');
      resetForm();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/room-types/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-types'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Tipo desativado');
    },
    onError: (err: Error) => toast.error('Não foi possível desativar', err.message),
  });

  function confirmDeactivate(t: RoomType) {
    if (!t.active) {
      toast.info('Tipo já está desativado');
      return;
    }
    if (
      confirm(
        `Desativar tipo "${t.name}"?\n\nBloqueado se houver quartos ativos com este tipo. Histórico preservado.`,
      )
    ) {
      deactivate.mutate(t.id);
    }
  }

  const visibleTypes = types.data?.filter((t) => t.active) ?? [];
  const inactiveTypes = types.data?.filter((t) => !t.active) ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Tipos de quarto" size="xl">
      <div className="p-5 grid md:grid-cols-2 gap-6">
        {/* Lista */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
            Tipos cadastrados ({visibleTypes.length})
          </h3>
          {types.isLoading && <div className="text-stone-400 text-sm">Carregando…</div>}

          {visibleTypes.map((t) => (
            <div
              key={t.id}
              className={cn(
                'border rounded-md p-3 text-sm transition',
                editingId === t.id
                  ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900'
                  : 'border-stone-200 hover:border-stone-300',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {t.name}{' '}
                    <span className="text-xs text-stone-400 font-mono font-normal">({t.code})</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    Cap. {t.capacity} · {t.beds} cama(s) ·{' '}
                    <span className="font-mono">
                      {Number(t.basePrice).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </span>
                  </div>
                  {t.description && (
                    <div className="text-xs text-stone-500 mt-1 line-clamp-2">{t.description}</div>
                  )}
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => startEdit(t)}
                    title="Editar"
                    className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded active:scale-95"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => confirmDeactivate(t)}
                    title="Desativar"
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!types.isLoading && visibleTypes.length === 0 && (
            <div className="text-sm text-stone-400 italic p-3 border border-dashed border-stone-200 rounded-md">
              Nenhum tipo ativo. Crie um no formulário ao lado.
            </div>
          )}

          {inactiveTypes.length > 0 && (
            <details className="mt-3 text-xs text-stone-500">
              <summary className="cursor-pointer hover:text-stone-700 select-none">
                {inactiveTypes.length} tipo(s) desativado(s)
              </summary>
              <ul className="mt-1 pl-3 space-y-0.5">
                {inactiveTypes.map((t) => (
                  <li key={t.id} className="opacity-70">
                    {t.name} ({t.code})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Formulário */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
          className="space-y-3"
        >
          <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
            {isEditing ? 'Editar tipo' : 'Novo tipo'}
          </h3>

          <FormField label="Nome">
            <input
              type="text"
              required
              placeholder="Ex: Suíte Master"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            />
          </FormField>

          <FormField label="Código">
            <input
              type="text"
              required
              placeholder="Ex: SM"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none uppercase"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-2">
            <FormField label="Capacidade">
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </FormField>
            <FormField label="Camas">
              <input
                type="number"
                min={1}
                value={form.beds}
                onChange={(e) => setForm({ ...form, beds: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </FormField>
          </div>

          <FormField label="Preço base (R$/noite)">
            <input
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0,00"
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            />
          </FormField>

          <FormField label="Descrição (opcional)">
            <textarea
              rows={2}
              placeholder="Comodidades, diferenciais…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
            />
          </FormField>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-3 py-2 text-sm text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 active:scale-95"
              >
                Cancelar edição
              </button>
            )}
            <button
              type="submit"
              disabled={submit.isPending}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 active:scale-95 disabled:opacity-50"
            >
              {submit.isPending ? (
                <Spinner size={14} />
              ) : !isEditing ? (
                <Plus className="w-4 h-4" />
              ) : null}
              {submit.isPending ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Adicionar tipo'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
