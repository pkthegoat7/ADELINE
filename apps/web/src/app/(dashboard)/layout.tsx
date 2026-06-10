'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  Search,
  ChevronRight,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdelinaMark } from '@/components/brand/Logo';
import { LogoutButton } from '@/components/LogoutButton';
import { CommandPalette } from '@/components/CommandPalette';
import { ReservationDrawer } from '@/components/ReservationDrawer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useUI } from '@/lib/ui-store';

interface MeResponse {
  user: { isSuperAdmin?: boolean; email: string };
  tenant: { name: string };
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Visão geral', icon: BarChart3, hint: 'Painel' },
  { href: '/recepcao', label: 'Recepção', icon: ClipboardList, hint: 'Check-ins' },
  { href: '/calendar', label: 'Calendário', icon: CalendarRange, hint: 'Timeline' },
  { href: '/reservations', label: 'Reservas', icon: ListChecks },
  { href: '/rooms', label: 'Quartos', icon: Bed },
  { href: '/guests', label: 'Hóspedes', icon: Users },
  { href: '/channels', label: 'Canais', icon: Plug },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Visão geral', subtitle: 'Resumo da operação' },
  '/recepcao': { title: 'Recepção', subtitle: 'Chegadas e saídas do dia' },
  '/calendar': { title: 'Calendário', subtitle: 'Disponibilidade e bloqueios' },
  '/reservations': { title: 'Reservas', subtitle: 'Histórico e gestão' },
  '/rooms': { title: 'Quartos', subtitle: 'Inventário e status' },
  '/guests': { title: 'Hóspedes', subtitle: 'Cadastro e histórico' },
  '/channels': { title: 'Canais', subtitle: 'Airbnb · Booking · iCal' },
  '/settings': { title: 'Configurações', subtitle: 'Preferências da pousada' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const openCmdk = useUI((s) => s.openCmdk);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
  });

  const pageMeta = PAGE_TITLES[pathname ?? ''] ?? { title: '', subtitle: '' };

  // Fecha o drawer mobile ao trocar de rota
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Trava o scroll do body quando drawer mobile esta aberto
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen flex bg-surface text-ink">
      {/* Backdrop mobile */}
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm md:hidden animate-fade-in"
        />
      )}

      {/* ============================== SIDEBAR ============================== */}
      <aside
        className={cn(
          'w-64 flex flex-col border-r border-line-soft bg-gradient-to-b from-[#0a0a0c] via-[#18181b] to-[#050507] text-zinc-100 overflow-hidden',
          // Mobile: overlay deslizante
          'fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: em fluxo, sempre visivel
          'md:relative md:translate-x-0 md:z-auto',
        )}
      >
        {/* Botao fechar (mobile) */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
          className="md:hidden absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-zinc-50 border border-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        {/* Ornamento de fundo */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 0%, rgb(232 165 46), transparent 50%), radial-gradient(circle at 70% 100%, rgb(168 90 44), transparent 60%)",
          }}
        />

        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-white/5 relative">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-11 h-11 rounded-xl shadow-lg shadow-brand-900/50 group-hover:shadow-gold-400/20 transition-all duration-300 group-hover:scale-[1.04]">
              <AdelinaMark className="w-11 h-11" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-gold-300 shadow-md shadow-gold-500/60 animate-pulse" />
            </div>
            <div className="leading-tight">
              <div className="font-serif text-[1.15rem] tracking-serif text-zinc-50 group-hover:text-gold-200 transition-colors">
                Adelina
              </div>
              <div className="text-[10px] text-zinc-300/70 uppercase tracking-[0.2em] -mt-0.5">
                {data?.tenant.name ?? 'Pousadas'}
              </div>
            </div>
          </Link>
        </div>

        {/* Busca */}
        <button
          onClick={openCmdk}
          className="mx-3 mt-4 flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-zinc-50 border border-white/5 hover:border-white/10 transition-all group"
        >
          <Search className="w-3.5 h-3.5 group-hover:text-gold-300 transition-colors" />
          <span className="flex-1 text-left text-xs">Buscar…</span>
          <span className="flex items-center gap-0.5">
            <kbd className="!bg-white/5 !text-zinc-400 !border-white/10">⌘</kbd>
            <kbd className="!bg-white/5 !text-zinc-400 !border-white/10">K</kbd>
          </span>
        </button>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 relative">
          <div className="px-3 pb-2 text-[10px] uppercase text-zinc-400/50 font-semibold tracking-[0.18em]">
            Operação
          </div>
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}

          {data?.user.isSuperAdmin && (
            <>
              <div className="mt-5 mb-2 px-3">
                <div className="h-px bg-gradient-to-r from-transparent via-gold-400/30 to-transparent" />
              </div>
              <div className="px-3 text-[10px] uppercase text-gold-300/60 font-semibold tracking-[0.18em] pb-1.5">
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

        {/* Rodapé */}
        <div className="px-3 py-3 border-t border-white/5 space-y-2 relative">
          <LogoutButton />
          <div className="text-[10px] text-zinc-500 px-3 flex items-center justify-between">
            <span className="font-mono">v0.2.0</span>
            <span className="flex items-center gap-1">
              <span className="ornament">◆</span>
              <span className="tracking-wider">ADELINA</span>
            </span>
          </div>
        </div>
      </aside>

      {/* ============================== MAIN ============================== */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden md:overflow-x-auto bg-surface">
        {/* Topbar */}
        <header className="sticky top-0 z-20 backdrop-blur-md bg-surface/80 border-b border-line-soft">
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-3.5">
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              {/* Hamburger mobile */}
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
                className="md:hidden inline-flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-sunken transition-colors flex-shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="hidden sm:flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                  <span className="truncate">{data?.tenant.name ?? 'Pousada'}</span>
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  <span className="text-ink-soft truncate">{pageMeta.title || 'Painel'}</span>
                </div>
                <h1 className="font-serif text-lg md:text-xl tracking-serif text-ink mt-0.5 truncate">
                  {pageMeta.subtitle || pageMeta.title || 'Bem-vindo'}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
              <button
                onClick={openCmdk}
                aria-label="Buscar"
                className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-sunken border border-line transition-all"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={openCmdk}
                className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ink-soft hover:text-ink hover:bg-surface-sunken border border-line transition-all"
              >
                <Search className="w-3.5 h-3.5" />
                Buscar
                <kbd>⌘K</kbd>
              </button>
              <ThemeToggle />
              <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-line">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-300 to-brand-600 flex items-center justify-center text-white text-xs font-semibold shadow-soft">
                  {(data?.user.email?.[0] ?? 'A').toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Conteúdo — animação em CSS pra evitar problema de mount/unmount do AnimatePresence */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1"
        >
          {children}
        </motion.div>
      </main>

      <CommandPalette />
      <ReservationDrawer />
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
        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] transition-all duration-200 group',
        active
          ? 'text-zinc-50 font-medium'
          : accent
            ? 'text-gold-200/80 hover:text-gold-100 hover:bg-white/[0.04]'
            : 'text-zinc-300/80 hover:text-zinc-50 hover:bg-white/[0.04]',
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active-bg"
          className="absolute inset-0 bg-gradient-to-r from-white/[0.08] to-white/[0.02] rounded-lg border border-white/[0.06]"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      {active && (
        <motion.div
          layoutId="sidebar-active-line"
          className={cn(
            'absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full',
            accent ? 'bg-gold-300 shadow-[0_0_8px_rgb(237_190_82_/_0.6)]' : 'bg-gradient-to-b from-brand-300 to-gold-400 shadow-[0_0_8px_rgb(232_165_46_/_0.5)]',
          )}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      <Icon
        className={cn(
          'w-[15px] h-[15px] relative z-10 transition-colors flex-shrink-0',
          active
            ? accent
              ? 'text-gold-300'
              : 'text-gold-300'
            : 'text-zinc-400/60 group-hover:text-zinc-200',
        )}
      />
      <span className="relative z-10 flex-1">{item.label}</span>
      {item.hint && active && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative z-10 text-[10px] uppercase tracking-wider text-zinc-400/60 font-medium"
        >
          {item.hint}
        </motion.span>
      )}
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}
