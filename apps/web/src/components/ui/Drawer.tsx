'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  width?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const WIDTH = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  width = 'md',
  children,
  footer,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-soft"
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`bg-surface-elevated shadow-modal w-full ${WIDTH[width]} h-full flex flex-col border-l border-line`}
          >
            {(title || description) && (
              <header className="flex items-start justify-between px-6 py-5 border-b border-line-soft bg-gradient-to-b from-surface-sunken/60 to-transparent">
                <div className="min-w-0">
                  {title && (
                    <h2 className="font-serif text-[1.35rem] tracking-serif text-ink truncate">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-sm text-ink-muted mt-1 truncate">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-ink-muted hover:text-ink hover:bg-surface-sunken rounded-lg p-1.5 -mt-1 -mr-1.5 flex-shrink-0 transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>
            )}
            <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
            {footer && (
              <footer className="border-t border-line-soft px-6 py-4 bg-surface-sunken/40">
                {footer}
              </footer>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
