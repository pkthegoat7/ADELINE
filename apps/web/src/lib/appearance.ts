'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type BrandPreset =
  | 'terracota' | 'ocean' | 'emerald' | 'violet' | 'rose' | 'slate'
  | 'amber' | 'teal' | 'indigo' | 'fuchsia' | 'wine';
export type Density = 'compact' | 'normal' | 'comfortable';
export type Radius = 'sharp' | 'default' | 'soft';
export type StylePreset = 'boutique' | 'moderno' | 'vidro' | 'contraste';
export type FontPreset = 'default' | 'elegante' | 'compacta';
export type BgPreset = 'plain' | 'gradient' | 'texture';
export type ThemePref = 'light' | 'dark' | 'system';

export interface Appearance {
  brand: BrandPreset;
  density: Density;
  radius: Radius;
  style: StylePreset;
  font: FontPreset;
  bg: BgPreset;
  theme?: ThemePref;
}

export const DEFAULT_APPEARANCE: Appearance = {
  brand: 'terracota',
  density: 'normal',
  radius: 'default',
  style: 'boutique',
  font: 'default',
  bg: 'plain',
  theme: 'system',
};

const KEY = 'adelina-appearance';

export interface BrandMeta {
  label: string;
  hex: string;
}

export const BRAND_PRESETS: Record<BrandPreset, BrandMeta> = {
  terracota: { label: 'Terracota', hex: '#c2733a' },
  ocean: { label: 'Oceano', hex: '#2563eb' },
  emerald: { label: 'Esmeralda', hex: '#059669' },
  violet: { label: 'Violeta', hex: '#7c3aed' },
  rose: { label: 'Rosé', hex: '#e11d48' },
  slate: { label: 'Grafite', hex: '#475569' },
  amber: { label: 'Âmbar', hex: '#d97706' },
  teal: { label: 'Teal', hex: '#0d9488' },
  indigo: { label: 'Índigo', hex: '#4f46e5' },
  fuchsia: { label: 'Fúcsia', hex: '#c026d3' },
  wine: { label: 'Vinho', hex: '#9f1239' },
};

export const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Compacta',
  normal: 'Padrão',
  comfortable: 'Confortável',
};

export const RADIUS_LABELS: Record<Radius, string> = {
  sharp: 'Reto',
  default: 'Padrão',
  soft: 'Suave',
};

export const STYLE_LABELS: Record<StylePreset, string> = {
  boutique: 'Boutique',
  moderno: 'Moderno',
  vidro: 'Vidro',
  contraste: 'Alto contraste',
};

export const FONT_LABELS: Record<FontPreset, string> = {
  default: 'Padrão',
  elegante: 'Elegante',
  compacta: 'Compacta',
};

export const BG_LABELS: Record<BgPreset, string> = {
  plain: 'Liso',
  gradient: 'Gradiente',
  texture: 'Textura',
};

export function loadCached(): Appearance {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return { ...DEFAULT_APPEARANCE, ...parsed };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveCached(ap: Appearance) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ap));
  } catch {}
}

export function applyToHtml(ap: Appearance) {
  if (typeof document === 'undefined') return;
  const h = document.documentElement;
  h.setAttribute('data-brand', ap.brand);
  h.setAttribute('data-density', ap.density);
  h.setAttribute('data-radius', ap.radius);
  h.setAttribute('data-style', ap.style);
  h.setAttribute('data-font', ap.font);
  h.setAttribute('data-bg', ap.bg);
}

/**
 * Normaliza dados vindos de Json? do banco.
 * Se vier null/undefined ou shape incompleto, retorna defaults.
 */
export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return DEFAULT_APPEARANCE;
  const v = value as Partial<Appearance>;
  return {
    brand: v.brand && v.brand in BRAND_PRESETS ? v.brand : DEFAULT_APPEARANCE.brand,
    density: v.density && v.density in DENSITY_LABELS ? v.density : DEFAULT_APPEARANCE.density,
    radius: v.radius && v.radius in RADIUS_LABELS ? v.radius : DEFAULT_APPEARANCE.radius,
    style: v.style && v.style in STYLE_LABELS ? v.style : DEFAULT_APPEARANCE.style,
    font: v.font && v.font in FONT_LABELS ? v.font : DEFAULT_APPEARANCE.font,
    bg: v.bg && v.bg in BG_LABELS ? v.bg : DEFAULT_APPEARANCE.bg,
    theme: v.theme,
  };
}

/**
 * Mutation pra salvar aparência no tenant. Atualiza cache local e
 * o cache do TanStack Query (`me`) otimisticamente.
 */
export function useUpdateAppearance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ap: Appearance) =>
      api<{ appearance: Appearance }>('/me/appearance', {
        method: 'PATCH',
        body: JSON.stringify(ap),
      }),
    onMutate: async (ap) => {
      saveCached(ap);
      applyToHtml(ap);
      const prev = qc.getQueryData<{ tenant?: { appearance?: unknown } } | undefined>(['me']);
      qc.setQueryData<typeof prev>(['me'], (old) =>
        old ? { ...old, tenant: { ...(old.tenant ?? {}), appearance: ap } } : old,
      );
      return { prev };
    },
    onError: (_e, _ap, ctx) => {
      if (ctx?.prev) qc.setQueryData(['me'], ctx.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

/**
 * Sincroniza aparência do servidor com o `<html>` quando `/me` carrega.
 * Server > cache local (mantemos cache em sync com o que veio).
 */
export function useAppearanceSync(serverAppearance: unknown) {
  useEffect(() => {
    if (serverAppearance === undefined) return;
    const next = normalizeAppearance(serverAppearance);
    applyToHtml(next);
    saveCached(next);
  }, [serverAppearance]);
}
