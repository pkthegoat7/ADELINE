'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  CalendarRange,
  Bed,
  Users,
  BarChart3,
  Plug,
  Settings,
  ClipboardList,
  ListChecks,
  Plus,
  ArrowRight,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useUI } from '@/lib/ui-store';
import { cn } from '@/lib/cn';

interface SearchResult {
  reservations: Array<{
    id: string;
    code: string;
    status: string;
    channel: string;
    checkIn: string;
    checkOut: string;
    guestName: string;
    rooms: string[];
  }>;
  guests: Array<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    document: string | null;
  }>;
  rooms: Array<{
    id: string;
    code: string;
    floor: number | null;
    status: string;
    roomType: { name: string; capacity: number };
  }>;
}

type Item = {
  key: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  action: () => void;
  group: 'Navegação' | 'Ações' | 'Reservas' | 'Hóspedes' | 'Quartos';
};

const NAV_ITEMS: Array<{ label: string; href: string; icon: LucideIcon; hint: string }> = [
  { label: 'Visão geral', href: '/painel', icon: BarChart3, hint: 'Dashboard' },
  { label: 'Recepção', href: '/recepcao', icon: ClipboardList, hint: 'Check-ins do dia' },
  { label: 'Calendário', href: '/calendario', icon: CalendarRange, hint: 'Timeline' },
  { label: 'Reservas', href: '/reservas', icon: ListChecks, hint: 'Listar reservas' },
  { label: 'Quartos', href: '/quartos', icon: Bed, hint: 'Cadastro de quartos' },
  { label: 'Hóspedes', href: '/hospedes', icon: Users, hint: 'Cadastro de hóspedes' },
  { label: 'Canais', href: '/canais', icon: Plug, hint: 'Airbnb / Booking' },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, hint: 'Preferências' },
];

export function CommandPalette() {
  const open = useUI((s) => s.cmdkOpen);
  const close = useUI((s) => s.closeCmdk);
  const toggle = useUI((s) => s.toggleCmdk);
  const openReservation = useUI((s) => s.openReservation);
  const router = useRouter();

  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Atalho global
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && open) close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, toggle]);

  // Reset ao fechar
  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const { data } = useQuery({
    queryKey: ['cmdk-search', q],
    queryFn: () => api<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
    enabled: open && q.trim().length >= 1,
    staleTime: 30_000,
  });

  const items = useMemo<Item[]>(() => {
    const navMatches = NAV_ITEMS.filter(
      (n) =>
        !q || n.label.toLowerCase().includes(q.toLowerCase()) || n.hint.toLowerCase().includes(q.toLowerCase()),
    ).map<Item>((n) => ({
      key: `nav-${n.href}`,
      icon: n.icon,
      label: n.label,
      hint: n.hint,
      group: 'Navegação',
      action: () => {
        router.push(n.href as never);
        close();
      },
    }));

    const actions: Item[] = [];
    if (!q || 'nova reserva'.includes(q.toLowerCase())) {
      actions.push({
        key: 'new-reservation',
        icon: Plus,
        label: 'Nova reserva',
        hint: 'Abrir formulário',
        group: 'Ações',
        action: () => {
          router.push('/reservas');
          close();
        },
      });
    }
    if (!q || 'novo hóspede'.includes(q.toLowerCase())) {
      actions.push({
        key: 'new-guest',
        icon: Plus,
        label: 'Novo hóspede',
        hint: 'Cadastrar pessoa',
        group: 'Ações',
        action: () => {
          router.push('/hospedes');
          close();
        },
      });
    }

    const reservations: Item[] =
      data?.reservations.map((r) => ({
        key: `r-${r.id}`,
        icon: ListChecks,
        label: `${r.guestName}`,
        hint: `${r.code} · quarto ${r.rooms.join(', ')}`,
        group: 'Reservas',
        action: () => {
          openReservation(r.id);
          close();
        },
      })) ?? [];

    const guests: Item[] =
      data?.guests.map((g) => ({
        key: `g-${g.id}`,
        icon: Users,
        label: g.fullName,
        hint: [g.email, g.phone, g.document].filter(Boolean).join(' · ') || 'Hóspede',
        group: 'Hóspedes',
        action: () => {
          router.push('/hospedes');
          close();
        },
      })) ?? [];

    const rooms: Item[] =
      data?.rooms.map((rm) => ({
        key: `rm-${rm.id}`,
        icon: Bed,
        label: `Quarto ${rm.code}`,
        hint: `${rm.roomType.name} · cap ${rm.roomType.capacity}`,
        group: 'Quartos',
        action: () => {
          router.push('/quartos');
          close();
        },
      })) ?? [];

    return [...actions, ...navMatches, ...reservations, ...guests, ...rooms];
  }, [q, data, router, close, openReservation]);

  useEffect(() => setCursor(0), [q, items.length]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cursor="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[cursor]?.action();
    }
  }

  // group items
  const grouped = useMemo(() => {
    const out: Array<{ group: string; items: Item[]; startIndex: number }> = [];
    const order: Item['group'][] = ['Ações', 'Navegação', 'Reservas', 'Hóspedes', 'Quartos'];
    let i = 0;
    for (const g of order) {
      const list = items.filter((it) => it.group === g);
      if (list.length === 0) continue;
      out.push({ group: g, items: list, startIndex: i });
      i += list.length;
    }
    return out;
  }, [items]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-soft flex items-start justify-center p-4 pt-[12vh]"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-surface-elevated rounded-2xl shadow-modal overflow-hidden flex flex-col max-h-[70vh] border border-line"
          >
            <div className="flex items-center gap-3 px-5 border-b border-line-soft bg-gradient-to-b from-surface-sunken/30 to-transparent">
              <Search className="w-4 h-4 text-brand-500 flex-shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar reservas, hóspedes, quartos, ou navegar…"
                className="flex-1 py-4 text-[15px] outline-none placeholder:text-ink-muted/60 bg-transparent text-ink"
              />
              <kbd>esc</kbd>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin">
              {items.length === 0 ? (
                <div className="px-4 py-14 text-center text-sm text-ink-muted">
                  <div className="text-2xl mb-2 opacity-30">◆</div>
                  Nenhum resultado para "{q}".
                </div>
              ) : (
                <div className="py-2">
                  {grouped.map((g) => (
                    <div key={g.group} className="mb-1">
                      <div className="px-5 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-muted/70">
                        {g.group}
                      </div>
                      {g.items.map((it, idx) => {
                        const absoluteIndex = g.startIndex + idx;
                        const Icon = it.icon;
                        const active = cursor === absoluteIndex;
                        return (
                          <button
                            key={it.key}
                            data-cursor={absoluteIndex}
                            onMouseEnter={() => setCursor(absoluteIndex)}
                            onClick={() => it.action()}
                            className={cn(
                              'w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm relative',
                              active ? 'bg-brand-50/60 dark:bg-white/[0.05]' : 'hover:bg-surface-sunken/50',
                            )}
                          >
                            {active && (
                              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-gradient-to-b from-brand-400 to-gold-400 rounded-r-full" />
                            )}
                            <Icon
                              className={cn(
                                'w-4 h-4 flex-shrink-0 transition-colors',
                                active ? 'text-brand-600' : 'text-ink-muted',
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <div className={cn('truncate', active && 'text-ink font-medium')}>{it.label}</div>
                              {it.hint && (
                                <div className="text-xs text-ink-muted truncate">{it.hint}</div>
                              )}
                            </div>
                            {active && (
                              <ArrowRight className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-line-soft px-5 py-2.5 text-[11px] text-ink-muted flex items-center gap-4 bg-surface-sunken/40">
              <span className="flex items-center gap-1">
                <kbd className="kbd">↑</kbd>
                <kbd className="kbd">↓</kbd> navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">
                  <CornerDownLeft className="w-2.5 h-2.5" />
                </kbd>{' '}
                abrir
              </span>
              <span className="ml-auto flex items-center gap-1">
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
