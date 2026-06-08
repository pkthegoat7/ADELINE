'use client';

import { useEffect, useState, useCallback } from 'react';

export type ResolvedTheme = 'light' | 'dark';
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'adelina-theme';

function resolveSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialPref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  } catch {
    return 'system';
  }
}

function applyToHtml(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function useTheme() {
  const [preference, setPref] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialPref();
    setPref(initial);
    const r = initial === 'system' ? resolveSystem() : initial;
    setResolved(r);
    setMounted(true);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setPref((p) => {
        if (p !== 'system') return p;
        const next: ResolvedTheme = mq.matches ? 'dark' : 'light';
        setResolved(next);
        applyToHtml(next);
        return p;
      });
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: ThemePref) => {
    setPref(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    const r = next === 'system' ? resolveSystem() : next;
    setResolved(r);
    applyToHtml(r);
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  return { theme: resolved, preference, setTheme, toggle, mounted };
}
