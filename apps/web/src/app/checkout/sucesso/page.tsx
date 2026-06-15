'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AdelinaMark } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { z } from 'zod';

const FormSchema = z.object({
  name: z.string().min(1, 'Nome completo obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  confirmPassword: z.string(),
  propertyName: z.string().min(1, 'Nome da pousada obrigatório'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

export default function CheckoutSucesso() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preapprovalId = searchParams.get('preapproval_id');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    propertyName: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  if (!preapprovalId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center">
          <p className="text-ink-soft mb-4">Link inválido. Nenhuma assinatura encontrada.</p>
          <a href="/" className="btn-primary px-6 py-2.5 text-sm">
            Voltar para o início
          </a>
        </div>
      </main>
    );
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setGlobalError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');

    const result = FormSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await api('/subscriptions/activate', {
        method: 'POST',
        body: JSON.stringify({
          preapprovalId,
          name: form.name,
          email: form.email,
          password: form.password,
          propertyName: form.propertyName,
        }),
      });
      router.push('/dashboard');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Erro ao ativar conta. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-3">
            <CheckCircle className="w-4 h-4" />
            Pagamento confirmado
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Crie sua conta</h1>
          <p className="text-ink-soft text-sm mt-1">
            Preencha os dados abaixo para acessar o sistema.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
          {globalError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {globalError}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">
              Nome completo
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="input-base w-full"
              placeholder="Seu nome"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="input-base w-full"
              placeholder="seu@email.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="input-base w-full"
              placeholder="Mínimo 8 caracteres"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1">
              Confirmar senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              className="input-base w-full"
              placeholder="Repita a senha"
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          <div>
            <label htmlFor="propertyName" className="block text-sm font-medium text-ink mb-1">
              Nome da pousada
            </label>
            <input
              id="propertyName"
              type="text"
              value={form.propertyName}
              onChange={(e) => updateField('propertyName', e.target.value)}
              className="input-base w-full"
              placeholder="Ex: Pousada Sol Nascente"
            />
            {errors.propertyName && (
              <p className="text-red-500 text-xs mt-1">{errors.propertyName}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full px-7 py-3 text-sm group disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Criando sua conta…
              </>
            ) : (
              <>
                Acessar o sistema
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
