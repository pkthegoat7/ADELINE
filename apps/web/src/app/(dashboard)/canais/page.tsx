'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/lib/use-permissions';
import { Plug, RefreshCw, Plus, Trash2, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ConnectChannelModal } from '@/components/ConnectChannelModal';
import { WhatsappSettings } from '@/components/WhatsappSettings';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { toast } from '@/lib/toast';

interface Channel {
  id: string;
  channel: string;
  status: string;
  icalImportUrl: string | null;
  lastSyncAt: string | null;
  syncError: string | null;
  errorCount: number;
  roomMappings: Array<{ id: string; externalRoomName: string | null; room: { code: string } }>;
}

interface ExportUrl {
  roomId: string;
  roomCode: string;
  url: string;
}

export default function ChannelsPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const can = useCan();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api<Channel[]>('/channels'),
  });

  const sync = useMutation({
    mutationFn: (id: string) => api(`/channels/${id}/sync`, { method: 'POST' }),
    onSuccess: () => {
      toast.info('Sincronização enfileirada', 'Pode levar alguns segundos.');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['channels'] });
        qc.invalidateQueries({ queryKey: ['calendar'] });
      }, 1500);
    },
    onError: (err: Error) => toast.error('Erro ao sincronizar', err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Canal removido');
    },
    onError: (err: Error) => toast.error('Erro ao remover', err.message),
  });

  function confirmRemove(c: Channel) {
    if (
      confirm(
        `Remover conexão com ${c.channel}?\n\n` +
          `Os bloqueios que vieram desse canal não são removidos automaticamente — você precisa cancelar as reservas correspondentes manualmente, se quiser.`,
      )
    ) {
      remove.mutate(c.id);
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Integrações</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Canais conectados</h2>
          <p className="text-sm text-ink-muted mt-1">Channel manager bidirecional via iCal.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-secondary">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
          {can('channel:manage') && (
            <button onClick={() => setModalOpen(true)} disabled={!propertyId} className="btn-primary">
              <Plus className="w-4 h-4" />
              Conectar canal
            </button>
          )}
        </div>
      </header>

      {can('settings:manage') && <WhatsappSettings />}

      {isLoading && <SkeletonCards count={2} />}

      {!isLoading && data?.length === 0 && (
        <div className="surface-card p-10 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/40 dark:to-brand-800/40 flex items-center justify-center">
            <Plug className="w-7 h-7 text-brand-600 dark:text-brand-300" />
          </div>
          <h2 className="font-serif text-xl tracking-serif text-ink">Nenhum canal conectado</h2>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Conecte Airbnb, Booking ou outro canal via iCal pra sincronizar reservas
            automaticamente a cada 5 minutos.
          </p>
          <button onClick={() => setModalOpen(true)} disabled={!propertyId} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Conectar primeiro canal
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data?.map((c) => (
          <ChannelCard
            key={c.id}
            channel={c}
            expanded={expandedId === c.id}
            onToggleExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
            onSync={() => sync.mutate(c.id)}
            onRemove={() => confirmRemove(c)}
            canManage={can('channel:manage')}
            syncing={sync.isPending && sync.variables === c.id}
            removing={remove.isPending && remove.variables === c.id}
          />
        ))}
      </div>

      <ConnectChannelModal
        propertyId={propertyId}
        open={modalOpen && !!propertyId}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

function ChannelCard({
  channel: c,
  expanded,
  onToggleExpand,
  onSync,
  onRemove,
  syncing,
  removing,
  canManage,
}: {
  channel: Channel;
  expanded: boolean;
  onToggleExpand: () => void;
  onSync: () => void;
  onRemove: () => void;
  syncing: boolean;
  removing: boolean;
  canManage: boolean;
}) {
  const exportUrls = useQuery({
    queryKey: ['channels', c.id, 'export-urls'],
    queryFn: () => api<ExportUrl[]>(`/channels/${c.id}/export-urls`),
    enabled: expanded,
  });

  return (
    <div className="surface-card p-5 space-y-3 card-hover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-stone-400" />
          <h2 className="font-semibold capitalize">{c.channel}</h2>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            c.status === 'active'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {c.status}
        </span>
      </div>

      <div className="text-xs text-stone-500 space-y-0.5">
        <div>
          Último sync:{' '}
          {c.lastSyncAt ? format(new Date(c.lastSyncAt), "dd/MM 'às' HH:mm") : 'Ainda não sincronizou'}
        </div>
        {c.errorCount > 0 && <div className="text-red-600">⚠ {c.errorCount} erro(s)</div>}
      </div>

      <div className="text-xs">
        <div className="font-semibold mb-1 text-stone-700">Quartos mapeados:</div>
        <ul className="space-y-0.5 text-stone-600">
          {c.roomMappings.map((m) => (
            <li key={m.id} className="font-mono">
              {m.room.code} ↔ {m.externalRoomName ?? '(sem nome)'}
            </li>
          ))}
        </ul>
      </div>

      {c.syncError && (
        <div className="bg-red-50 text-red-700 text-xs p-2 rounded">⚠ {c.syncError}</div>
      )}

      {canManage && (
      <div className="flex gap-2 pt-1 border-t border-stone-100">
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex-1 text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-1.5 rounded-md inline-flex items-center justify-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
        <button
          onClick={onRemove}
          disabled={removing}
          className="px-3 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
          title="Remover conexão"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      )}

      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between text-xs text-stone-600 hover:text-stone-900 pt-2 border-t border-stone-100"
      >
        <span className="flex items-center gap-1">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          URLs pra colar no {c.channel} (exportação)
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 bg-stone-50 -mx-5 -mb-5 px-5 py-3 border-t border-stone-200 rounded-b-lg">
          <p className="text-xs text-stone-600">
            Cole estas URLs nas configurações do {c.channel} pra ele saber o que está bloqueado
            aqui:
          </p>
          {exportUrls.data?.map((u) => (
            <div key={u.roomId} className="space-y-1">
              <div className="text-xs font-semibold text-stone-700">{u.roomCode}</div>
              <div className="flex gap-1">
                <input
                  readOnly
                  value={u.url}
                  className="flex-1 px-2 py-1 text-xs font-mono bg-surface-sunken border border-line rounded"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(u.url)}
                  className="px-2 py-1 bg-stone-200 hover:bg-stone-300 rounded text-xs"
                  title="Copiar"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
