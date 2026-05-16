'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarRange,
  Bed,
  Users,
  BarChart3,
  Plug,
  Settings,
  ListChecks,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';
import { api } from '@/lib/api';

interface MeResponse {
  user: { isSuperAdmin?: boolean; email: string };
  tenant: { name: string };
}

const navItems = [
  { href: '/dashboard', label: 'Visão geral', icon: BarChart3 },
  { href: '/recepcao', label: 'Recepção', icon: ClipboardList },
  { href: '/calendar', label: 'Calendário', icon: CalendarRange },
  { href: '/reservations', label: 'Reservas', icon: ListChecks },
  { href: '/rooms', label: 'Quartos', icon: Bed },
  { href: '/guests', label: 'Hóspedes', icon: Users },
  { href: '/channels', label: 'Canais', icon: Plug },
  { href: '/settings', label: 'Configurações', icon: Settings },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-stone-900 text-stone-100 flex flex-col">
        <div className="p-5 border-b border-stone-800">
          <Link href="/" className="text-xl font-bold text-brand-200">
            Adelina PMS
          </Link>
          <p className="text-xs text-stone-400 mt-1">{data?.tenant.name ?? '—'}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href as never}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-stone-800 transition"
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}

          {data?.user.isSuperAdmin && (
            <>
              <div className="border-t border-stone-800 my-3" />
              <div className="px-3 text-xs uppercase text-stone-500 font-medium pb-1">
                Super admin
              </div>
              <Link
                href={'/admin/cadastrar-pousada' as never}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-stone-800 transition text-amber-200"
              >
                <ShieldCheck className="w-4 h-4" />
                Cadastrar pousada
              </Link>
            </>
          )}
        </nav>
        <div className="p-3 border-t border-stone-800 space-y-2">
          <LogoutButton />
          <div className="text-xs text-stone-500 px-3">v0.1.0 — MVP</div>
        </div>
      </aside>
      <main className="flex-1 bg-stone-50 overflow-x-auto">{children}</main>
    </div>
  );
}
