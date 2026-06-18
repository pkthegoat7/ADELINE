'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors disabled:opacity-50 text-ink-soft hover:text-ink hover:bg-surface-sunken dark:text-sand-300/70 dark:hover:text-sand-50 dark:hover:bg-white/[0.04]"
    >
      {loading ? <Spinner size={14} /> : <LogOut className="w-3.5 h-3.5" />}
      Sair
    </button>
  );
}
