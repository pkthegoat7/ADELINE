'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { Select } from '@/components/ui/Select';

type Tab = 'receipts' | 'payments' | 'cashflow';

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

const METHOD_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartão crédito',
  debit_card: 'Cartão débito',
  bank_transfer: 'Transferência',
  link: 'Link MP',
  channel_collected: 'Cobrado pelo canal',
};
const CAT_LABELS: Record<string, string> = {
  repasse: 'Repasse a proprietário',
  utilities_water: 'Água',
  utilities_power: 'Energia',
  utilities_internet: 'Internet/Telefonia',
  cleaning: 'Limpeza',
  maintenance: 'Manutenção',
  salaries: 'Salários/Pessoal',
  taxes: 'Impostos/Taxas',
  supplies: 'Suprimentos',
  marketing: 'Marketing',
  software: 'Sistemas/Assinaturas',
  rent: 'Aluguel',
  other: 'Outros',
  sem_categoria: 'Sem categoria',
};
const methodLabel = (m: string) => METHOD_LABELS[m] ?? m;
const catLabel = (c: string) => CAT_LABELS[c] ?? c;

const TAB_LABEL: Record<Tab, string> = {
  receipts: 'Recebimentos',
  payments: 'Pagamentos',
  cashflow: 'Caixa',
};

interface Property {
  id: string;
  name: string;
}

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>('receipts');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [propertyId, setPropertyId] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (propertyId) p.set('propertyId', propertyId);
    return p.toString();
  }, [from, to, propertyId]);

  const { data, isLoading } = useQuery({
    queryKey: ['report', tab, qs],
    queryFn: () => api<any>(`/reports/${tab}?${qs}`),
  });
  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api<Property[]>('/properties'),
  });

  const downloadCsv = async () => {
    const res = await api<Response>(`/reports/${tab}?${qs}&format=csv`, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1400px] print:p-0 print:space-y-3">
      {/* Cabeçalho */}
      <header className="print:hidden">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
          <span className="ornament">◆</span>
          <span>Financeiro</span>
        </div>
        <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Relatórios</h2>
        <p className="text-sm text-ink-muted mt-1">
          Recebimentos, pagamentos e fluxo de caixa por período.
        </p>
      </header>

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block">
        <h1 className="text-lg font-bold">Relatório — {TAB_LABEL[tab]}</h1>
        <p className="text-sm">
          Período: {from} a {to}
        </p>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1.5 print:hidden" role="tablist">
        {(['receipts', 'payments', 'cashflow'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-surface-2 text-ink-muted hover:text-ink'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Filtros + export */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="De" className="w-[9.5rem]">
          <input
            type="date"
            className="input-base w-full"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Até" className="w-[9.5rem]">
          <input
            type="date"
            className="input-base w-full"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="Propriedade" className="w-56">
          <Select
            value={propertyId}
            onChange={setPropertyId}
            options={[
              { value: '', label: 'Todas as propriedades' },
              ...((properties ?? []).map((p) => ({ value: p.id, label: p.name }))),
            ]}
          />
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={downloadCsv} className="btn-secondary inline-flex items-center gap-1.5">
            <FileDown size={15} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="btn-secondary inline-flex items-center gap-1.5"
          >
            <Printer size={15} /> PDF
          </button>
        </div>
      </div>

      {/* Conteúdo por aba */}
      {isLoading ? (
        <p className="text-ink-muted py-12 text-center">Carregando…</p>
      ) : tab === 'receipts' ? (
        <ReceiptsView data={data} />
      ) : tab === 'payments' ? (
        <PaymentsView data={data} />
      ) : (
        <CashflowView data={data} />
      )}
    </div>
  );
}

/** Campo rotulado: rótulo padronizado acima do controle, alinhado na base. */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-xs uppercase tracking-wide text-ink-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Card({ title, value, tone }: { title: string; value: string; tone?: 'in' | 'out' | 'net' }) {
  const color =
    tone === 'in' ? 'text-emerald-600' : tone === 'out' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{title}</div>
      <div className={`text-2xl font-serif num-tabular mt-1 ${color}`}>{value}</div>
    </div>
  );
}

/**
 * `align`: índices das colunas (0-based) que devem alinhar à direita —
 * valores monetários/numéricos. Essas colunas recebem `num-tabular`.
 */
function Table({
  head,
  rows,
  align = [],
}: {
  head: string[];
  rows: (string | number)[][];
  align?: number[];
}) {
  const isRight = (j: number) => align.includes(j);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface-card print:border-0">
      <table className="w-full text-sm">
        <thead className="text-ink-muted border-b border-line bg-surface-2/40">
          <tr>
            {head.map((h, j) => (
              <th
                key={h}
                className={`px-3 py-2.5 font-medium whitespace-nowrap ${
                  isRight(j) ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-10 text-center text-ink-muted">
                Sem dados no período.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-surface-2/30">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2.5 ${
                      isRight(j) ? 'text-right num-tabular text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptsView({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Total recebido" value={brl(data.total)} tone="in" />
        <Card title="Lançamentos" value={String(data.count)} />
        {data.byMethod.map((m: any) => (
          <Card key={m.method} title={methodLabel(m.method)} value={brl(m.amount)} />
        ))}
      </div>
      <Table
        head={['Data', 'Hóspede', 'Reserva', 'Propriedade', 'Método', 'Valor']}
        align={[5]}
        rows={data.rows.map((r: any) => [
          r.paidAt,
          r.guestName,
          r.reservationCode,
          r.propertyName ?? '—',
          methodLabel(r.method),
          brl(r.amount),
        ])}
      />
    </div>
  );
}

function PaymentsView({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Total pago" value={brl(data.total)} tone="out" />
        {data.byCategory.map((c: any) => (
          <Card key={c.key} title={catLabel(c.key)} value={brl(c.amount)} />
        ))}
      </div>
      <Table
        head={['Data', 'Tipo', 'Descrição', 'Fornecedor/Prop.', 'Categoria', 'Propriedade', 'Valor']}
        align={[6]}
        rows={data.rows.map((r: any) => [
          r.paidAt,
          r.type === 'payout' ? 'Repasse' : 'Despesa',
          r.description,
          r.counterparty ?? '—',
          r.category ? catLabel(r.category) : r.type === 'payout' ? 'Repasse' : '—',
          r.propertyName ?? '—',
          brl(r.amount),
        ])}
      />
    </div>
  );
}

function CashflowView({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card title="Entradas" value={brl(data.totalIn)} tone="in" />
        <Card title="Saídas" value={brl(data.totalOut)} tone="out" />
        <Card title="Resultado" value={brl(data.net)} tone="net" />
      </div>
      <Table
        head={['Dia', 'Entradas', 'Saídas', 'Saldo']}
        align={[1, 2, 3]}
        rows={data.daily.map((d: any) => [d.date, brl(d.inflow), brl(d.outflow), brl(d.net)])}
      />
    </div>
  );
}
