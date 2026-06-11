'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface CreatedLink {
  url: string;
  phone: string;
  sentViaWhatsapp: boolean;
  whatsappError: string | null;
}

export function SendRegistrationLinkModal({
  open,
  onClose,
  reservationId,
  reservationCode,
  initialPhone,
}: {
  open: boolean;
  onClose: () => void;
  /** Quando presente, a ficha preenche a reserva (FNRH + hóspedes na reserva). */
  reservationId?: string;
  reservationCode?: string;
  initialPhone?: string | null;
}) {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPhone(initialPhone ?? '');
  }, [open, initialPhone]);

  const create = useMutation({
    mutationFn: () =>
      api<CreatedLink>('/guest-links', {
        method: 'POST',
        body: JSON.stringify({ phone, reservationId }),
      }),
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
    <Modal
      open={open}
      onClose={close}
      title={reservationCode ? `Enviar ficha — reserva ${reservationCode}` : 'Enviar link de cadastro'}
      size="md"
    >
      <div className="p-5 space-y-4">
        <p className="text-sm text-ink-muted">
          {reservationId
            ? 'O hóspede preenche a própria ficha (dados, documento e acompanhantes) e tudo entra automaticamente nesta reserva, com a FNRH assinada.'
            : 'O hóspede recebe um link pelo WhatsApp pra preencher a própria ficha: dados pessoais, documento com foto e acompanhantes.'}
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
            <div>
              <label className="text-xs font-medium text-ink-muted uppercase tracking-wider">
                WhatsApp do hóspede
              </label>
              <input
                type="tel"
                required
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="input-base mt-1"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close} className="btn-ghost">
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
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
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
