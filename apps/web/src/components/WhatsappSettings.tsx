'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, QrCode, RefreshCw, Send, Unplug } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

interface WhatsappStatus {
  configured: boolean;
  instance: { instanceName: string; status: string; phoneNumber: string | null } | null;
  state: 'connected' | 'connecting' | 'disconnected';
}

interface ConnectResponse {
  qrBase64?: string;
  pairingCode?: string;
  code?: string;
}

export function WhatsappSettings() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<ConnectResponse | null>(null);
  const [testPhone, setTestPhone] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp'],
    queryFn: () => api<WhatsappStatus>('/whatsapp'),
    // Enquanto há QR na tela ou está conectando, fica de olho no estado
    refetchInterval: (q) => (qr || q.state.data?.state === 'connecting' ? 4000 : false),
  });

  const connect = useMutation({
    mutationFn: () => api<ConnectResponse>('/whatsapp/connect', { method: 'POST' }),
    onSuccess: (res) => {
      setQr(res);
      qc.invalidateQueries({ queryKey: ['whatsapp'] });
    },
    onError: (err: Error) => toast.error('Erro ao conectar', err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => api('/whatsapp/disconnect', { method: 'POST' }),
    onSuccess: () => {
      setQr(null);
      qc.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('WhatsApp desconectado');
    },
    onError: (err: Error) => toast.error('Erro ao desconectar', err.message),
  });

  const test = useMutation({
    mutationFn: () =>
      api('/whatsapp/test', { method: 'POST', body: JSON.stringify({ phone: testPhone }) }),
    onSuccess: () => toast.success('Mensagem de teste enviada!'),
    onError: (err: Error) => toast.error('Falha no envio', err.message),
  });

  const connected = data?.state === 'connected';
  useEffect(() => {
    if (connected) setQr(null);
  }, [connected]);

  return (
    <section className="surface-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-ink flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          WhatsApp
        </h2>
        {data && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              connected
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : data.state === 'connecting'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-surface-sunken text-ink-muted'
            }`}
          >
            {connected ? 'Conectado' : data.state === 'connecting' ? 'Conectando…' : 'Desconectado'}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted mb-4">
        Conecte o WhatsApp da pousada pra enviar fichas de cadastro, lembretes e links de
        check-in aos hóspedes.
      </p>

      {isLoading && <div className="text-sm text-ink-muted">Carregando…</div>}

      {data && !data.configured && (
        <div className="text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-200 rounded-lg px-3 py-2.5">
          Integração indisponível: o servidor ainda não tem <code className="font-mono">EVOLUTION_API_URL</code> e{' '}
          <code className="font-mono">EVOLUTION_API_KEY</code> configuradas.
        </div>
      )}

      {data?.configured && !connected && (
        <div className="space-y-4">
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="btn-primary"
          >
            <QrCode className="w-4 h-4" />
            {connect.isPending ? 'Gerando QR code…' : qr ? 'Gerar novo QR code' : 'Conectar WhatsApp'}
          </button>

          {qr && (
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-surface-sunken/60">
              {qr.qrBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr.qrBase64.startsWith('data:') ? qr.qrBase64 : `data:image/png;base64,${qr.qrBase64}`}
                  alt="QR code do WhatsApp"
                  className="w-52 h-52 rounded-lg bg-white p-2 shadow-sm"
                />
              ) : (
                <div className="text-sm font-mono bg-white dark:bg-zinc-900 rounded-lg p-4 break-all max-w-xs">
                  {qr.pairingCode ?? qr.code ?? 'QR indisponível — tente de novo'}
                </div>
              )}
              <ol className="text-sm text-ink-soft space-y-1.5 list-decimal list-inside">
                <li>Abra o WhatsApp no celular da pousada</li>
                <li>Toque em <strong>Configurações → Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar aparelho</strong> e aponte pro QR code</li>
                <li>Aguarde — o status muda pra “Conectado” sozinho</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {connected && (
        <div className="space-y-4">
          {data?.instance?.phoneNumber && (
            <div className="text-sm text-ink-soft">
              Número conectado:{' '}
              <span className="font-mono font-semibold text-ink">+{data.instance.phoneNumber}</span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-ink-muted uppercase tracking-wider">
                Testar envio (seu número)
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="input-base mt-1"
              />
            </div>
            <button
              onClick={() => test.mutate()}
              disabled={test.isPending || testPhone.replace(/\D/g, '').length < 8}
              className="btn-secondary"
            >
              <Send className="w-4 h-4" />
              {test.isPending ? 'Enviando…' : 'Enviar teste'}
            </button>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="btn-ghost text-red-600 dark:text-red-400"
            >
              <Unplug className="w-4 h-4" />
              Desconectar
            </button>
          </div>
        </div>
      )}

      {data?.configured && data.state === 'connecting' && !qr && (
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['whatsapp'] })}
          className="btn-ghost mt-2 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar status
        </button>
      )}
    </section>
  );
}
