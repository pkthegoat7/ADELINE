'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface MeResponse {
  user: { userId: string; tenantId: string; email: string; role: string };
  tenant: { id: string; name: string; slug: string; plan: string; status: string; createdAt: string };
}

export default function SettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-stone-500 text-sm">Informações da pousada e da sua conta.</p>
      </header>

      {isLoading && <div className="text-stone-500">Carregando…</div>}

      {data && (
        <div className="space-y-4">
          <section className="bg-white border border-stone-200 rounded-lg p-5">
            <h2 className="font-semibold text-stone-900 mb-3">Pousada</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="Nome" value={data.tenant.name} />
              <InfoRow label="Slug" value={data.tenant.slug} />
              <InfoRow label="Plano" value={data.tenant.plan} capitalize />
              <InfoRow label="Status" value={data.tenant.status} capitalize />
              <InfoRow
                label="Criada em"
                value={new Date(data.tenant.createdAt).toLocaleDateString('pt-BR')}
              />
              <InfoRow label="ID interno" value={data.tenant.id} mono />
            </dl>
          </section>

          <section className="bg-white border border-stone-200 rounded-lg p-5">
            <h2 className="font-semibold text-stone-900 mb-3">Sua conta</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="Email" value={data.user.email} />
              <InfoRow label="Função" value={data.user.role} capitalize />
              <InfoRow label="ID de usuário" value={data.user.userId} mono />
            </dl>
          </section>

          <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            <strong>Em construção:</strong> edição de dados, gerenciamento de usuários, integrações
            de pagamento (Pix/Stripe), WhatsApp e notificações virão nas próximas iterações.
          </section>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-stone-500">{label}</dt>
      <dd
        className={`mt-0.5 ${mono ? 'font-mono text-xs' : ''} ${capitalize ? 'capitalize' : ''} text-stone-900`}
      >
        {value}
      </dd>
    </div>
  );
}
