'use client';

import { Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

interface Props {
  variant?: 'default' | 'sidebar';
  className?: string;
}

export function ThemeToggle({ variant = 'default', className }: Props) {
  const { theme, toggle, mounted } = useTheme();

  if (!mounted) {
    return (
      <button
        aria-label="Alternar tema"
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-full',
          variant === 'sidebar'
            ? 'bg-white/5 border border-white/10'
            : 'bg-surface-elevated border border-line',
          className,
        )}
      >
        <span className="w-4 h-4" />
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Modo claro' : 'Modo escuro'}
      data-tip={isDark ? 'Modo claro' : 'Modo escuro'}
      className={cn(
        'relative inline-flex items-center justify-center w-9 h-9 rounded-full overflow-hidden',
        'transition-all duration-300 hover:scale-105 active:scale-95',
        variant === 'sidebar'
          ? 'bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10'
          : 'bg-surface-elevated border border-line text-ink-soft hover:text-ink hover:border-brand-400/40',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Moon className="w-4 h-4" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 90, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.7 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Sun className="w-4 h-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
