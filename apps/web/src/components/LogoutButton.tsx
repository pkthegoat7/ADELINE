'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui/Spinner';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-stone-400 hover:text-stone-50 hover:bg-stone-800/50 disabled:opacity-50"
    >
      {loading ? <Spinner size={16} /> : <LogOut className="w-4 h-4" />}
      Sair
    </button>
  );
}
