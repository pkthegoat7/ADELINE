'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
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
  type LucideIcon,
} from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface MeResponse {
  user: { isSuperAdmin?: boolean; email: string };
  tenant: { name: string };
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Visão geral', icon: BarChart3 },
  { href: '/recepcao', label: 'Recepção', icon: ClipboardList },
  { href: '/calendar', label: 'Calendário', icon: CalendarRange },
  { href: '/reservations', label: 'Reservas', icon: ListChecks },
  { href: '/rooms', label: 'Quartos', icon: Bed },
  { href: '/guests', label: 'Hóspedes', icon: Users },
  { href: '/channels', label: 'Canais', icon: Plug },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gradient-to-b from-stone-900 to-stone-950 text-stone-100 flex flex-col border-r border-stone-800">
        <div className="px-5 py-5 border-b border-stone-800/60">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-stone-900 font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
              A
            </div>
            <div>
              <div className="font-bold tracking-tight text-stone-50">Adelina PMS</div>
              <div className="text-[10px] text-stone-400 -mt-0.5 uppercase tracking-wide">
                {data?.tenant.name ?? '...'}
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}

          {data?.user.isSuperAdmin && (
            <>
              <div className="border-t border-stone-800/60 my-3" />
              <div className="px-3 text-[10px] uppercase text-stone-500 font-semibold tracking-wider pb-1">
                Super admin
              </div>
              <NavLink
                item={{
                  href: '/admin/cadastrar-pousada',
                  label: 'Cadastrar pousada',
                  icon: ShieldCheck,
                }}
                active={isActive(pathname, '/admin/cadastrar-pousada')}
                accent
              />
            </>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-stone-800/60 space-y-2">
          <LogoutButton />
          <div className="text-[10px] text-stone-500 px-3 flex items-center justify-between">
            <span>v0.1.0</span>
            <span className="text-stone-600">MVP</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-stone-50 overflow-x-auto">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function NavLink({
  item,
  active,
  accent,
}: {
  item: NavItem;
  active: boolean;
  accent?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href as never}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group',
        active
          ? 'text-stone-50 font-medium'
          : accent
            ? 'text-amber-200/90 hover:text-amber-100 hover:bg-stone-800/50'
            : 'text-stone-400 hover:text-stone-50 hover:bg-stone-800/50',
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 bg-stone-800 rounded-md"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      {active && (
        <motion.div
          layoutId="sidebar-active-line"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-brand-400 rounded-r"
        />
      )}
      <Icon
        className={cn(
          'w-4 h-4 relative z-10 transition-colors',
          active && (accent ? 'text-amber-200' : 'text-brand-300'),
        )}
      />
      <span className="relative z-10">{item.label}</span>
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}
