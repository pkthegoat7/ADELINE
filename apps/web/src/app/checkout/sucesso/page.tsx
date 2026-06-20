'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AdelinaGlyph } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { z } from 'zod';

const FormSchema = z
  .object({
    name: z.string().min(1, 'Nome completo obrigatório'),
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
    confirmPassword: z.string(),
    propertyName: z.string().min(1, 'Nome da pousada obrigatório'),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'É necessário aceitar os Termos e a Política de Privacidade.' }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmPassword'],
  });

const BENEFITS = [
  'Reservas, calendário e check-in num só lugar',
  'Channel manager iCal com Airbnb e Booking',
  'Anti-overbooking automático em tempo real',
  'Suporte humano, em português',
];

export default function CheckoutSucessoPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-surface">
          <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
        </main>
      }
    >
      <CheckoutSucesso />
    </Suspense>
  );
}

/* Ornamentos de fundo — atmosfera quente (terracota + dourado) */
function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-40 -left-32 w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--brand) / 0.45), rgb(var(--gold) / 0.12) 55%, transparent 72%)',
        }}
      />
      <div
        className="absolute -bottom-48 -right-32 w-[40rem] h-[40rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--gold) / 0.35), rgb(var(--brand) / 0.10) 55%, transparent 72%)',
        }}
      />
      {/* Grão sutil */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

function CheckoutSucesso() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preapprovalId = searchParams.get('preapproval_id');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    propertyName: '',
    acceptedTerms: false as boolean,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!preapprovalId) {
    return (
      <main className="relative min-h-screen flex items-center justify-center bg-surface px-4">
        <Ambience />
        <div className="relative surface-card shadow-elevated px-8 py-10 text-center max-w-sm animate-scale-in">
          <div className="flex justify-center mb-4 text-ink-muted">
            <AdelinaGlyph className="w-10 h-10" />
          </div>
          <h1 className="font-display text-xl font-bold text-ink mb-2">Link inválido</h1>
          <p className="text-ink-soft text-sm mb-6">
            Nenhuma assinatura foi encontrada neste link.
          </p>
          <a href="/" className="btn-primary px-6 py-2.5 text-sm w-full">
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
          acceptedTerms: form.acceptedTerms,
        }),
      });
      router.push('/painel');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Erro ao ativar conta. Tente novamente.');
      setLoading(false);
    }
  }

  const passwordOk = form.password.length >= 8;

  return (
    <main className="relative min-h-screen bg-surface">
      <Ambience />

      <div className="relative grid lg:grid-cols-[1.05fr_1fr] min-h-screen">
        {/* ── Painel de marca (esquerda) ───────────────────────────── */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-brand text-white px-12 py-14">
          {/* glow dourado */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full blur-3xl opacity-40"
            style={{ background: 'radial-gradient(circle, rgb(var(--gold) / 0.6), transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-3 animate-slide-up">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-white/12 ring-1 ring-white/20 backdrop-blur">
                <AdelinaGlyph className="w-6 h-6 text-white" />
              </span>
              <span className="font-display text-lg font-semibold tracking-serif">Adelina</span>
            </div>

            <div
              className="mt-14 inline-flex items-center gap-2 rounded-full bg-white/12 ring-1 ring-white/20 px-3 py-1.5 text-xs font-medium backdrop-blur animate-slide-up"
              style={{ animationDelay: '60ms' }}
            >
              <Sparkles className="w-3.5 h-3.5 text-gold-200" />
              Assinatura confirmada
            </div>

            <h2
              className="mt-5 font-display text-[2.1rem] leading-[1.1] font-bold max-w-sm animate-slide-up"
              style={{ animationDelay: '120ms' }}
            >
              Falta um passo para sua pousada decolar.
            </h2>
            <p
              className="mt-3 text-white/75 text-sm max-w-sm leading-relaxed animate-slide-up"
              style={{ animationDelay: '180ms' }}
            >
              Crie seu acesso e comece a gerenciar reservas, canais e hóspedes em minutos.
            </p>
          </div>

          <ul className="relative space-y-3.5">
            {BENEFITS.map((b, i) => (
              <li
                key={b}
                className="flex items-start gap-3 text-sm text-white/90 animate-slide-up"
                style={{ animationDelay: `${260 + i * 70}ms` }}
              >
                <BadgeCheck className="w-5 h-5 shrink-0 text-gold-200" />
                {b}
              </li>
            ))}
          </ul>

          <div
            className="relative flex items-center gap-2 text-xs text-white/60 animate-fade-in"
            style={{ animationDelay: '600ms' }}
          >
            <ShieldCheck className="w-4 h-4" />
            Pagamento processado com segurança pelo Mercado Pago
          </div>
        </aside>

        {/* ── Formulário (direita) ─────────────────────────────────── */}
        <section className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="w-full max-w-md animate-slide-up">
            {/* Cabeçalho mobile + badge */}
            <div className="lg:hidden flex justify-center mb-5">
              <span className="grid place-items-center w-12 h-12 rounded-xl bg-gradient-brand text-white shadow-elevated">
                <AdelinaGlyph className="w-7 h-7" />
              </span>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-4">
              <CheckCircle2 className="w-4 h-4" />
              Pagamento confirmado
            </div>

            <h1 className="font-display text-3xl font-bold text-ink tracking-serif">Crie sua conta</h1>
            <p className="text-ink-soft text-sm mt-1.5 mb-7">
              Preencha os dados abaixo para acessar o sistema.
            </p>

            <form onSubmit={handleSubmit} className="surface-card shadow-elevated p-6 sm:p-7 space-y-4">
              {globalError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm animate-slide-down">
                  {globalError}
                </div>
              )}

              <Field
                id="name"
                label="Nome completo"
                icon={<User className="w-4 h-4" />}
                value={form.name}
                onChange={(v) => updateField('name', v)}
                placeholder="Seu nome"
                error={errors.name}
                autoComplete="name"
              />

              <Field
                id="email"
                label="Email"
                type="email"
                icon={<Mail className="w-4 h-4" />}
                value={form.email}
                onChange={(v) => updateField('email', v)}
                placeholder="seu@email.com"
                error={errors.email}
                autoComplete="email"
              />

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    className="input-base"
                    style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password ? (
                  <p className="text-red-500 text-xs mt-1.5">{errors.password}</p>
                ) : (
                  form.password.length > 0 && (
                    <p
                      className={`flex items-center gap-1 text-xs mt-1.5 transition-colors ${
                        passwordOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-muted'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Pelo menos 8 caracteres
                    </p>
                  )
                )}
              </div>

              <Field
                id="confirmPassword"
                label="Confirmar senha"
                type={showPassword ? 'text' : 'password'}
                icon={<Lock className="w-4 h-4" />}
                value={form.confirmPassword}
                onChange={(v) => updateField('confirmPassword', v)}
                placeholder="Repita a senha"
                error={errors.confirmPassword}
                autoComplete="new-password"
              />

              <Field
                id="propertyName"
                label="Nome da pousada"
                icon={<Building2 className="w-4 h-4" />}
                value={form.propertyName}
                onChange={(v) => updateField('propertyName', v)}
                placeholder="Ex: Pousada Sol Nascente"
                error={errors.propertyName}
              />

              <label className="flex items-start gap-2.5 text-sm text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(e) => setForm((p) => ({ ...p, acceptedTerms: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-ink-muted/40 text-brand-600 focus:ring-brand-600"
                />
                <span>
                  Li e aceito os{' '}
                  <a href="/termos" target="_blank" className="text-brand-600 underline">Termos de Uso</a>{' '}
                  e a{' '}
                  <a href="/privacidade" target="_blank" className="text-brand-600 underline">Política de Privacidade</a>.
                </span>
              </label>
              {errors.acceptedTerms && (
                <p className="text-red-500 text-xs">{errors.acceptedTerms}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full px-7 py-3 text-sm group mt-1"
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

              <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted pt-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Seus dados são protegidos e nunca compartilhados.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ── Campo de input com ícone à esquerda ──────────────────────── */
function Field({
  id,
  label,
  icon,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
  autoComplete,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base"
          style={{ paddingLeft: '2.5rem' }}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      </div>
      {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
    </div>
  );
}
