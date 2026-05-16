'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface MeResponse {
  user: { isSuperAdmin?: boolean };
}

export default function CadastrarPousadaPage() {
  const router = useRouter();

  // Verifica se o user atual é super admin
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    propertyName: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    tenantId: string;
    propertyId: string;
    userId: string;
  } | null>(null);

  function setTenantName(v: string) {
    const slug = v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, tenantName: v, tenantSlug: f.tenantSlug || slug }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api<{ tenantId: string; propertyId: string; userId: string }>(
        '/auth/signup-tenant',
        {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            fullName: form.fullName,
            tenantName: form.tenantName,
            tenantSlug: form.tenantSlug,
            propertyName: form.propertyName,
          }),
        },
      );
      setCreated(result);
      setForm({
        tenantName: '',
        tenantSlug: '',
        propertyName: '',
        fullName: '',
        email: '',
        password: '',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (me.isLoading) {
    return <div className="p-6 text-stone-500">Verificando permissões…</div>;
  }

  if (!me.data?.user.isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto bg-amber-50 border border-amber-300 rounded-lg p-6 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-amber-600" />
          <h2 className="font-semibold text-amber-900">Acesso restrito</h2>
          <p className="text-sm text-amber-900">
            Esta página é exclusiva pra super admins do sistema. Sua conta não tem essa permissão.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-amber-900 hover:underline"
          >
            ← Voltar pro dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </Link>
        <h1 className="text-2xl font-bold">Cadastrar nova pousada</h1>
        <p className="text-stone-500 text-sm">
          Cria uma pousada + dono em uma única operação. Apenas super admins veem esta página.
        </p>
      </header>

      {created && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 mb-4 space-y-2">
          <div className="text-sm text-emerald-900 font-medium">✓ Pousada criada com sucesso</div>
          <div className="text-xs text-emerald-800 font-mono space-y-0.5">
            <div>tenantId: {created.tenantId}</div>
            <div>propertyId: {created.propertyId}</div>
            <div>userId: {created.userId}</div>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="text-xs text-emerald-900 underline hover:text-emerald-700"
          >
            Cadastrar outra
          </button>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="bg-white border border-stone-200 rounded-lg p-6 space-y-4"
      >
        <fieldset className="space-y-3">
          <legend className="text-xs uppercase text-stone-500 font-medium pb-2">Pousada</legend>

          <div>
            <label className="text-xs font-medium text-stone-700">Nome da pousada</label>
            <input
              type="text"
              required
              value={form.tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
              placeholder="Pousada do Sol"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Identificador (slug)</label>
            <input
              type="text"
              required
              minLength={3}
              pattern="[a-z0-9-]+"
              value={form.tenantSlug}
              onChange={(e) => setForm({ ...form, tenantSlug: e.target.value.toLowerCase() })}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md font-mono lowercase"
              placeholder="pousada-do-sol"
            />
            <p className="text-xs text-stone-500 mt-0.5">
              mínimo 3 caracteres; só minúsculas, números e hífens
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Nome do estabelecimento</label>
            <input
              type="text"
              required
              value={form.propertyName}
              onChange={(e) => setForm({ ...form, propertyName: e.target.value })}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
              placeholder="Sede / Unidade principal"
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-stone-100 pt-4">
          <legend className="text-xs uppercase text-stone-500 font-medium pb-2">
            Dono da pousada (owner)
          </legend>

          <div>
            <label className="text-xs font-medium text-stone-700">Nome completo</label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Senha inicial</label>
            <input
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md font-mono"
            />
            <p className="text-xs text-stone-500 mt-0.5">
              mínimo 8 caracteres. O dono troca depois pelo "Esqueci senha".
            </p>
          </div>
        </fieldset>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-stone-900 text-white text-sm font-medium rounded-md hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ? 'Criando…' : 'Cadastrar pousada'}
        </button>
      </form>
    </div>
  );
}
