'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-stone-300 hover:bg-stone-800 transition"
    >
      <LogOut className="w-4 h-4" />
      Sair
    </button>
  );
}
