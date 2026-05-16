'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase captura o token do hash da URL automaticamente e cria sessão.
    // Esperamos o evento PASSWORD_RECOVERY pra habilitar o formulário.
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setSessionReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace('/dashboard'), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-lg p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Definir nova senha</h1>
          <p className="text-sm text-stone-500">Escolha uma senha forte para sua conta.</p>
        </div>

        {!sessionReady ? (
          <div className="text-sm text-stone-500 bg-stone-100 rounded-md p-3">
            Validando link…<br />
            <span className="text-xs">
              Se ficar travado, o link pode ter expirado.{' '}
              <Link href="/esqueci-senha" className="underline">
                Solicite outro
              </Link>
              .
            </span>
          </div>
        ) : done ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-md p-3">
            ✓ Senha atualizada com sucesso. Redirecionando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-700" htmlFor="password">
                Nova senha
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-700" htmlFor="confirm">
                Confirmar nova senha
              </label>
              <input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md"
              />
            </div>

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
              {loading ? 'Atualizando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
