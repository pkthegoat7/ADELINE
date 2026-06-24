'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Select } from '@/components/ui/Select';

const METHODS = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'credit_card', label: 'Cartão crédito' },
  { value: 'debit_card', label: 'Cartão débito' },
  { value: 'bank_transfer', label: 'Transferência' },
];

export function RecordReceiptModal({
  reservationId,
  onClose,
}: {
  reservationId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('pix');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api(`/payments/reservations/${reservationId}/receipts`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), method, paidAt, note: note.trim() || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Recebimento registrado.');
      onClose();
    },
    onError: (err: Error) => toast.error('Não foi possível registrar o recebimento.', err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="surface-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-ink mb-4">Registrar recebimento</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Valor (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Método</label>
            <Select value={method} onChange={setMethod} options={METHODS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Data do recebimento</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Observação (opcional)</label>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Sinal recebido no balcão"
              className="input-base w-full"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm flex-1">
              Cancelar
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!(Number(amount) > 0) || save.isPending}
              className="btn-primary px-4 py-2 text-sm flex-1 disabled:opacity-50"
            >
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
