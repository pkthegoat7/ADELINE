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
  Wallet,
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
  user: { isSuperAdmin?: boolean; email: string; role?: string };
  tenant: { name: string };
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const navItems: NavItem[] = [
  { href: '/painel', label: 'Visão geral', icon: BarChart3, hint: 'Painel' },
  { href: '/recepcao', label: 'Recepção', icon: ClipboardList, hint: 'Check-ins' },
  { href: '/calendario', label: 'Calendário', icon: CalendarRange, hint: 'Timeline' },
  { href: '/reservas', label: 'Reservas', icon: ListChecks },
  { href: '/quartos', label: 'Quartos', icon: Bed },
  { href: '/hospedes', label: 'Hóspedes', icon: Users },
  { href: '/canais', label: 'Canais', icon: Plug },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/painel': { title: 'Visão geral', subtitle: 'Resumo da operação' },
  '/recepcao': { title: 'Recepção', subtitle: 'Chegadas e saídas do dia' },
  '/calendario': { title: 'Calendário', subtitle: 'Disponibilidade e bloqueios' },
  '/reservas': { title: 'Reservas', subtitle: 'Histórico e gestão' },
  '/quartos': { title: 'Quartos', subtitle: 'Inventário e status' },
  '/hospedes': { title: 'Hóspedes', subtitle: 'Cadastro e histórico' },
  '/canais': { title: 'Canais', subtitle: 'Airbnb · Booking · iCal' },
  '/equipe': { title: 'Equipe', subtitle: 'Logins e permissões' },
  '/configuracoes': { title: 'Configurações', subtitle: 'Preferências da pousada' },
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

  // Equipe: visível só pra proprietário/gerente (a API valida de novo no servidor)
  const canManageTeam = data?.user.role === 'owner' || data?.user.role === 'manager';
  const visibleNav = canManageTeam
    ? [
        ...navItems.slice(0, -1),
        { href: '/equipe', label: 'Equipe', icon: ShieldCheck, hint: 'Acessos' } as NavItem,
        navItems[navItems.length - 1],
      ]
    : navItems;

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
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden animate-fade-in"
        />
      )}

      {/* ============================== SIDEBAR ============================== */}
      <aside
        className={cn(
          'w-64 flex flex-col border-r overflow-hidden',
          // Claro: superfície quente reativa ao tema; Escuro: gradiente navy original
          'border-line bg-surface-elevated text-ink',
          'dark:border-line-soft dark:bg-gradient-to-b dark:from-[#0a0a0c] dark:via-[#18181b] dark:to-[#050507] dark:text-zinc-100',
          // Mobile: overlay deslizante
          'fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop (>=1024px): em fluxo, sempre visível. Abaixo disso = drawer.
          'lg:relative lg:translate-x-0 lg:z-auto',
        )}
      >
        {/* Botao fechar (mobile) */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
          className="lg:hidden absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors bg-surface-sunken hover:bg-surface-sunken/70 text-ink-soft hover:text-ink border border-line dark:bg-white/[0.05] dark:hover:bg-white/[0.1] dark:text-zinc-300 dark:hover:text-zinc-50 dark:border-white/10"
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
        <div className="px-5 pt-6 pb-5 border-b border-line dark:border-white/5 relative">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-11 h-11 rounded-xl shadow-lg shadow-brand-900/50 group-hover:shadow-gold-400/20 transition-all duration-300 group-hover:scale-[1.04]">
              <AdelinaMark className="w-11 h-11" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-gold-300 shadow-md shadow-gold-500/60 animate-pulse" />
            </div>
            <div className="leading-tight">
              <div className="font-serif text-[1.15rem] tracking-serif text-ink dark:text-zinc-50 group-hover:text-gold-600 dark:group-hover:text-gold-200 transition-colors">
                Adelina
              </div>
              <div className="text-[10px] text-ink-muted dark:text-zinc-300/70 uppercase tracking-[0.2em] -mt-0.5">
                {data?.tenant.name ?? 'Pousada'}
              </div>
            </div>
          </Link>
        </div>

        {/* Busca */}
        <button
          onClick={openCmdk}
          className="mx-3 mt-4 flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg border transition-all group bg-surface-sunken hover:bg-surface-sunken/70 text-ink-soft hover:text-ink border-line dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:text-zinc-300 dark:hover:text-zinc-50 dark:border-white/5 dark:hover:border-white/10"
        >
          <Search className="w-3.5 h-3.5 group-hover:text-gold-500 dark:group-hover:text-gold-300 transition-colors" />
          <span className="flex-1 text-left text-xs">Buscar…</span>
          <span className="flex items-center gap-0.5">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        </button>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 relative">
          <div className="px-3 pb-2 text-[10px] uppercase text-ink-muted dark:text-zinc-400/50 font-semibold tracking-[0.18em]">
            Operação
          </div>
          {visibleNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}

          {data?.user.isSuperAdmin && (
            <>
              <div className="mt-5 mb-2 px-3">
                <div className="h-px bg-gradient-to-r from-transparent via-gold-400/30 to-transparent" />
              </div>
              <div className="px-3 text-[10px] uppercase text-gold-600 dark:text-gold-300/60 font-semibold tracking-[0.18em] pb-1.5">
                Super admin
              </div>
              <NavLink
                item={{
                  href: '/admin/assinantes',
                  label: 'Assinantes',
                  icon: Wallet,
                }}
                active={isActive(pathname, '/admin/assinantes')}
                accent
              />
              <NavLink
                item={{
                  href: '/admin/cadastrar-pousada',
                  label: 'Cadastrar pousada',
                  icon: ShieldCheck,
                }}
                active={isActive(pathname, '/admin/cadastrar-pousada')}
                accent
              />
              <NavLink
                item={{
                  href: '/admin/configuracoes',
                  label: 'Configurações sistema',
                  icon: Settings,
                }}
                active={isActive(pathname, '/admin/configuracoes')}
                accent
              />
            </>
          )}
        </nav>

        {/* Rodapé */}
        <div className="px-3 py-3 border-t border-line dark:border-white/5 space-y-2 relative">
          <LogoutButton />
          <div className="text-[10px] text-ink-muted dark:text-zinc-500 px-3 flex items-center justify-between">
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
                className="lg:hidden inline-flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-sunken transition-colors flex-shrink-0"
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
                className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-sunken border border-line transition-all"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={openCmdk}
                className="hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ink-soft hover:text-ink hover:bg-surface-sunken border border-line transition-all"
              >
                <Search className="w-3.5 h-3.5" />
                Buscar
                <kbd>⌘K</kbd>
              </button>
              <ThemeToggle />
              <div className="hidden lg:flex items-center gap-2 pl-3 ml-1 border-l border-line">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-300 to-brand-600 flex items-center justify-center text-white text-xs font-semibold shadow-soft">
                  {(data?.tenant.name?.trim()?.[0] ?? 'P').toUpperCase()}
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
          ? 'text-ink dark:text-zinc-50 font-medium'
          : accent
            ? 'text-gold-700 hover:text-gold-800 hover:bg-surface-sunken dark:text-gold-200/80 dark:hover:text-gold-100 dark:hover:bg-white/[0.04]'
            : 'text-ink-soft hover:text-ink hover:bg-surface-sunken dark:text-zinc-300/80 dark:hover:text-zinc-50 dark:hover:bg-white/[0.04]',
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active-bg"
          className="absolute inset-0 rounded-lg border bg-gradient-to-r from-brand-100/70 to-brand-50/30 border-brand-200/50 dark:from-white/[0.08] dark:to-white/[0.02] dark:border-white/[0.06]"
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
            ? 'text-gold-500 dark:text-gold-300'
            : 'text-ink-muted group-hover:text-ink dark:text-zinc-400/60 dark:group-hover:text-zinc-200',
        )}
      />
      <span className="relative z-10 flex-1">{item.label}</span>
      {item.hint && active && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative z-10 text-[10px] uppercase tracking-wider text-ink-muted dark:text-zinc-400/60 font-medium"
        >
          {item.hint}
        </motion.span>
      )}
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/painel') return pathname === '/painel' || pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}
