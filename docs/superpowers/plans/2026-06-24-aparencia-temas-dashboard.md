# Aparência expandida + Dashboard impactante + Redesign landing/login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir o sistema de temas do app (mais cores, estilos curados, fontes, fundos), repaginar o dashboard e a landing/login, e fechar o furo de RBAC que expõe dado financeiro no /painel.

**Architecture:** Estende o sistema de tokens CSS por `data-*` já existente (sem libs novas, sem migração — `tenant.appearance` é Json). Novos eixos `data-style/data-font/data-bg` somam-se a `data-brand/density/radius`. RBAC reusa `can()`/`expense:read` em UI e servidor. Visual da landing/login é fixo (não reage ao tema do tenant).

**Tech Stack:** Next.js 15 / React 19 / Tailwind (tokens CSS vars) / NestJS+Fastify / vitest (só apps/api).

**Spec:** `docs/superpowers/specs/2026-06-24-aparencia-temas-dashboard-design.md`

**Convenções do repo (importante):**
- `apps/web` **não tem test runner** → lógica pura do web valida por `pnpm typecheck` + verificação visual. NÃO introduzir vitest no web (YAGNI).
- `apps/api` tem vitest: `pnpm --filter @adelina/api test`.
- Typecheck: `pnpm typecheck` (raiz). Baseline de ~21 erros pré-existentes em `dashboard.controller.ts`/`whatsapp/*`/`zod-filter`/`availability` — **não conta como regressão**; só falha se aparecer erro NOVO.
- Commits frequentes, mensagens em pt-BR, terminar com a linha Co-Authored-By.

---

## File Structure

**Modificados:**
- `apps/web/src/lib/appearance.ts` — +eixos `style/font/bg` (tipos, defaults, labels, normalize, applyToHtml).
- `apps/web/src/app/globals.css` — +presets de cor, +blocos `data-style/data-font/data-bg`.
- `apps/web/src/app/layout.tsx` — script de boot seta os 3 atributos novos; carrega fonte serifada se necessário.
- `apps/web/src/app/(dashboard)/configuracoes/page.tsx` — `AppearanceSection` ganha seletores Estilo/Fonte/Fundo.
- `apps/web/src/app/(dashboard)/painel/page.tsx` — redesign visual + gating `expense:read`.
- `apps/api/src/modules/dashboard/dashboard.controller.ts` — `summary` filtra campos financeiros por papel.
- `apps/web/src/app/page.tsx` — redesign landing.
- `apps/web/src/app/login/page.tsx` (confirmar caminho na Task 11) — redesign login.

**Criados:**
- `apps/api/src/modules/dashboard/dashboard.access.ts` — função pura `redactFinancials(summary, canSeeFinancials)`.
- `apps/api/src/modules/dashboard/dashboard.access.spec.ts` — teste vitest.

---

## Phase 0 — Conserto RBAC (servidor + UI)

### Task 1: Função pura para redigir campos financeiros (servidor)

**Files:**
- Create: `apps/api/src/modules/dashboard/dashboard.access.ts`
- Test: `apps/api/src/modules/dashboard/dashboard.access.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/api/src/modules/dashboard/dashboard.access.spec.ts
import { describe, it, expect } from 'vitest';
import { redactFinancials } from './dashboard.access';

const base = {
  occupancy: { occupied: 2, total: 4, percent: 50 },
  todayCheckIns: [],
  todayCheckOuts: [],
  upcomingArrivals: [],
  monthRevenue: { value: 12345, reservationCount: 7 },
  adr: 250.5,
  revPar: 120.25,
  occupancySeries: [{ date: '2026-06-01', occupied: 1, total: 4, percent: 25 }],
  channels: [],
};

describe('redactFinancials', () => {
  it('mantém tudo quando o usuário pode ver financeiro', () => {
    expect(redactFinancials(base, true)).toEqual(base);
  });

  it('remove receita/ADR/RevPAR quando não pode ver financeiro', () => {
    const out = redactFinancials(base, false);
    expect(out.monthRevenue).toBeNull();
    expect(out.adr).toBeNull();
    expect(out.revPar).toBeNull();
  });

  it('preserva campos não-financeiros quando redige', () => {
    const out = redactFinancials(base, false);
    expect(out.occupancy).toEqual(base.occupancy);
    expect(out.occupancySeries).toEqual(base.occupancySeries);
    expect(out.channels).toEqual(base.channels);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @adelina/api test dashboard.access`
Expected: FAIL — `Cannot find module './dashboard.access'`.

- [ ] **Step 3: Implementar a função mínima**

```ts
// apps/api/src/modules/dashboard/dashboard.access.ts

/** Campos financeiros do summary do dashboard, redigidos p/ papéis sem expense:read. */
export interface DashboardFinancials {
  monthRevenue: { value: number; reservationCount: number } | null;
  adr: number | null;
  revPar: number | null;
}

/**
 * Redige (zera p/ null) os campos financeiros do summary quando o usuário
 * não tem permissão de ver financeiro. Função pura — não muta a entrada.
 */
export function redactFinancials<T extends DashboardFinancials>(
  summary: T,
  canSeeFinancials: boolean,
): T {
  if (canSeeFinancials) return summary;
  return { ...summary, monthRevenue: null, adr: null, revPar: null };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @adelina/api test dashboard.access`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/dashboard/dashboard.access.ts apps/api/src/modules/dashboard/dashboard.access.spec.ts
git commit -m "feat(dashboard): função pura redactFinancials p/ RBAC do summary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2: Aplicar redactFinancials no endpoint summary

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.controller.ts`

- [ ] **Step 1: Importar dependências de RBAC e CurrentUser**

No topo de `dashboard.controller.ts`, adicionar aos imports existentes:

```ts
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { can } from '../../common/permissions';
import { redactFinancials } from './dashboard.access';
```

(`TenantId` já é importado de `tenant.decorator`; ajuste para importar `CurrentUser` e `AuthContext` da mesma origem.)

- [ ] **Step 2: Injetar o usuário no handler `summary`**

Trocar a assinatura do método `summary` (linha ~71) de:

```ts
  async summary(@TenantId() tenantId: string, @Query('propertyId') propertyId?: string) {
```

para:

```ts
  async summary(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthContext,
    @Query('propertyId') propertyId?: string,
  ) {
```

- [ ] **Step 3: Redigir o retorno conforme o papel**

O método hoje faz `return this.prisma.withTenant(tenantId, async (tx) => { ... return { ...summary } })`. Capturar o resultado e redigir:

```ts
    const summary = await this.prisma.withTenant(tenantId, async (tx) => {
      // ...todo o corpo atual permanece igual, terminando no `return { occupancy, ... }`
    });

    return redactFinancials(summary, can(user.role, 'expense:read'));
```

(Apenas envolver: renomear o `return this.prisma...` para `const summary = await this.prisma...` e adicionar o `return redactFinancials(...)` ao final do método.)

- [ ] **Step 4: Typecheck (sem regressão nova)**

Run: `pnpm typecheck`
Expected: nenhum erro NOVO em `dashboard.controller.ts` além do baseline. Se aparecer erro de tipo no `monthRevenue` ser `... | null`, é esperado que o **front** trate isso (Task 3) — o controller em si compila.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/dashboard/dashboard.controller.ts
git commit -m "feat(dashboard): summary omite receita/ADR/RevPAR p/ papéis sem expense:read

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 3: Esconder KPIs financeiros no /painel (UI)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/painel/page.tsx`

- [ ] **Step 1: Ler a estrutura atual dos KPIs**

Abrir `painel/page.tsx`. Localizar: o `interface`/type do summary (linhas ~39-50, com `monthRevenue`, `adr`/`revPar`), e os cards "Receita do mês"/ADR/RevPAR (linhas ~189-208).

- [ ] **Step 2: Tornar os campos financeiros opcionais no tipo**

No tipo do summary, trocar os campos financeiros para aceitarem `null` (o servidor agora pode mandar null):

```ts
  monthRevenue: { value: number; reservationCount: number } | null;
  adr: number | null;
  revPar: number | null;
```

- [ ] **Step 3: Importar e usar useCan**

Adicionar import (se ainda não houver):

```ts
import { useCan } from '@/lib/use-permissions';
```

Dentro do componente da página, perto dos outros hooks:

```ts
  const can = useCan();
  const canFinance = can('expense:read');
```

- [ ] **Step 4: Gatear os cards financeiros**

Envolver os três cards (Receita do mês, ADR/"Receita média por diária", RevPAR/"Receita por quarto disponível") num bloco condicional:

```tsx
  {canFinance && (
    <>
      {/* card Receita do mês */}
      {/* card ADR */}
      {/* card RevPAR */}
    </>
  )}
```

Garantir que o grid de KPIs não quebre quando os cards somem (ex: grid com `auto-fit`/`flex-wrap` ou renderizar só os cards presentes). Para papéis sem `expense:read`, mostrar os KPIs restantes (Ocupação, check-ins) ocupando o espaço.

- [ ] **Step 5: Typecheck + verificação manual**

Run: `pnpm typecheck`
Expected: sem erro novo.

Verificação manual (descrever no checkpoint): logar como `receptionist`/`readonly` → não vê Receita/ADR/RevPAR; como `owner` → vê tudo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/painel/page.tsx
git commit -m "fix(painel): esconder receita/ADR/RevPAR de papéis sem expense:read

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 1 — Sistema de temas expandido

### Task 4: Estender o modelo de aparência (appearance.ts)

**Files:**
- Modify: `apps/web/src/lib/appearance.ts`

- [ ] **Step 1: Adicionar os tipos e presets novos**

No `appearance.ts`, adicionar tipos e tabelas de label (logo após os tipos existentes):

```ts
export type StylePreset = 'boutique' | 'moderno' | 'vidro' | 'contraste';
export type FontPreset = 'default' | 'elegante' | 'compacta';
export type BgPreset = 'plain' | 'gradient' | 'texture';

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
```

- [ ] **Step 2: Adicionar as 5 cores novas a BRAND_PRESETS**

Estender o tipo `BrandPreset` e o objeto `BRAND_PRESETS`:

```ts
export type BrandPreset =
  | 'terracota' | 'ocean' | 'emerald' | 'violet' | 'rose' | 'slate'
  | 'amber' | 'teal' | 'indigo' | 'fuchsia' | 'wine';
```

```ts
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
```

- [ ] **Step 3: Estender interface Appearance, defaults, normalize, applyToHtml**

```ts
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
```

Em `applyToHtml`, adicionar:

```ts
  h.setAttribute('data-style', ap.style);
  h.setAttribute('data-font', ap.font);
  h.setAttribute('data-bg', ap.bg);
```

Em `normalizeAppearance`, adicionar validação dos 3 novos (cada um cai no default se inválido):

```ts
  return {
    brand: v.brand && v.brand in BRAND_PRESETS ? v.brand : DEFAULT_APPEARANCE.brand,
    density: v.density && v.density in DENSITY_LABELS ? v.density : DEFAULT_APPEARANCE.density,
    radius: v.radius && v.radius in RADIUS_LABELS ? v.radius : DEFAULT_APPEARANCE.radius,
    style: v.style && v.style in STYLE_LABELS ? v.style : DEFAULT_APPEARANCE.style,
    font: v.font && v.font in FONT_LABELS ? v.font : DEFAULT_APPEARANCE.font,
    bg: v.bg && v.bg in BG_LABELS ? v.bg : DEFAULT_APPEARANCE.bg,
    theme: v.theme,
  };
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: pode aparecer erro em `configuracoes/page.tsx` porque `DEFAULT_APPEARANCE`/`draft` agora exigem os campos novos — será resolvido na Task 7. O `appearance.ts` em si compila. Se houver erro SÓ em configuracoes, seguir.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/appearance.ts
git commit -m "feat(aparencia): +5 cores e eixos style/font/bg no modelo de Appearance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 5: CSS dos novos presets de cor (globals.css)

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Adicionar as 5 rampas de cor**

Na seção "BRAND PRESETS" do `globals.css`, após o último `html[data-brand="slate"]`, adicionar 5 blocos (rampa de 11 tons, mesmo formato `R G B`). Valores (Tailwind):

```css
html[data-brand="amber"] {
  --brand-50: 255 251 235; --brand-100: 254 243 199; --brand-200: 253 230 138;
  --brand-300: 252 211 77;  --brand-400: 251 191 36;  --brand-500: 217 119 6;
  --brand-600: 180 83 9;    --brand-700: 146 64 14;   --brand-800: 120 53 15;
  --brand-900: 113 63 18;   --brand-950: 69 26 3;
}
html[data-brand="teal"] {
  --brand-50: 240 253 250; --brand-100: 204 251 241; --brand-200: 153 246 228;
  --brand-300: 94 234 212;  --brand-400: 45 212 191;  --brand-500: 13 148 136;
  --brand-600: 13 148 136;  --brand-700: 15 118 110;  --brand-800: 17 94 89;
  --brand-900: 19 78 74;    --brand-950: 4 47 46;
}
html[data-brand="indigo"] {
  --brand-50: 238 242 255; --brand-100: 224 231 255; --brand-200: 199 210 254;
  --brand-300: 165 180 252; --brand-400: 129 140 248; --brand-500: 79 70 229;
  --brand-600: 79 70 229;   --brand-700: 67 56 202;   --brand-800: 55 48 163;
  --brand-900: 49 46 129;   --brand-950: 30 27 75;
}
html[data-brand="fuchsia"] {
  --brand-50: 253 244 255; --brand-100: 250 232 255; --brand-200: 245 208 254;
  --brand-300: 240 171 252; --brand-400: 232 121 249; --brand-500: 192 38 211;
  --brand-600: 192 38 211;  --brand-700: 162 28 175;  --brand-800: 134 25 143;
  --brand-900: 112 26 117;  --brand-950: 74 4 78;
}
html[data-brand="wine"] {
  --brand-50: 255 241 242; --brand-100: 255 228 230; --brand-200: 254 205 211;
  --brand-300: 253 164 175; --brand-400: 251 113 133; --brand-500: 159 18 57;
  --brand-600: 159 18 57;   --brand-700: 136 19 55;   --brand-800: 119 18 48;
  --brand-900: 100 17 42;   --brand-950: 65 7 25;
}
```

- [ ] **Step 2: Verificação manual (preview)**

`pnpm dev:web`, abrir Configurações → Aparência (após Task 7) e clicar cada cor nova. Por ora, validar que `pnpm typecheck` segue sem erro novo (CSS não é tipado, então só checa que não quebrou build): `pnpm --filter @adelina/web build` não é necessário aqui; basta o dev server subir.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(aparencia): rampas CSS das 5 cores novas (amber/teal/indigo/fuchsia/wine)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 6: CSS dos eixos style / font / bg (globals.css)

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Blocos data-style**

Adicionar uma seção nova. `boutique` é o default (já refletido em `:root`), então só definir os 3 desvios. Ajustar variáveis de superfície/linha/sombra (reusar `--shadow-color` existente):

```css
/* ESTILOS CURADOS (data-style) — ajustam superfície/sombra/blur, NÃO a cor brand */
html[data-style="moderno"] {
  --shadow-color: 20 14 8;          /* sombra mais marcada */
  --line: 215 205 185;              /* linhas mais visíveis */
}
html[data-style="moderno"] .surface-card { box-shadow: var(--shadow-elevated, 0 12px 24px -8px rgb(var(--shadow-color) / 0.18)); }

html[data-style="vidro"] .surface-card {
  background: rgb(var(--surface-elevated) / 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgb(255 255 255 / 0.18);
}
html[data-style="vidro"].dark .surface-card,
.dark html[data-style="vidro"] .surface-card {
  background: rgb(var(--surface-elevated) / 0.5);
  border-color: rgb(255 255 255 / 0.08);
}

html[data-style="contraste"] {
  --ink: 0 0 0;
  --line: 120 110 95;
}
html[data-style="contraste"].dark { --ink: 255 255 255; --line: 200 200 200; }
html[data-style="contraste"] .surface-card { box-shadow: none; border: 1.5px solid rgb(var(--line)); }
```

(Nota: ajustar o seletor de dark conforme como `.dark` é aplicado — a classe `dark` fica no `<html>` junto do `data-style`, então `html[data-style="vidro"].dark` é o correto. Validar no dev server.)

- [ ] **Step 2: Blocos data-font**

```css
/* FONTES (data-font) — sobrescreve as famílias já carregadas via next/font */
html[data-font="elegante"] {
  --font-display: var(--font-serif-display, Georgia), serif;
}
html[data-font="elegante"] h1,
html[data-font="elegante"] h2,
html[data-font="elegante"] .font-display { letter-spacing: -0.01em; }

html[data-font="compacta"] { letter-spacing: -0.01em; }
html[data-font="compacta"] body { font-size: 0.96em; }
```

(Se "Elegante" for usar uma serifada display dedicada, ela é carregada na Task 6b; senão cai no fallback `Georgia, serif`.)

- [ ] **Step 3: Blocos data-bg**

```css
/* FUNDO (data-bg) */
html[data-bg="gradient"] body { background-image: var(--tw-gradient-warm, linear-gradient(135deg, rgb(var(--surface)) 0%, rgb(var(--surface-sunken)) 100%)); background-attachment: fixed; }
html[data-bg="texture"] body { background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E"); }
```

- [ ] **Step 4: Verificação manual no dev server**

`pnpm dev:web` → após a Task 7, trocar Estilo/Fonte/Fundo e confirmar que cada um muda o look e que dark mode segue legível (atenção especial ao `vidro` no escuro).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(aparencia): CSS dos eixos style/font/bg (boutique/moderno/vidro/contraste etc)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 6b (condicional): Carregar fonte serifada display "Elegante"

**Só executar se a fonte fallback `Georgia` não satisfizer.** Caso contrário, pular.

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Importar uma serifada display do next/font**

```ts
import { Inter, Poppins, JetBrains_Mono, Fraunces } from 'next/font/google';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});
```

Adicionar `${fraunces.variable}` ao `className` do `<html>`.

- [ ] **Step 2: Verificação + commit**

`pnpm dev:web`, selecionar Fonte "Elegante", confirmar títulos serifados.

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(aparencia): fonte serifada Fraunces p/ o tema Elegante

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 7: Boot script + UI dos novos seletores

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/(dashboard)/configuracoes/page.tsx`

- [ ] **Step 1: Atualizar o script inline de boot (anti-flash)**

Em `layout.tsx`, no bloco `var brand = ...`, adicionar defaults e leitura dos 3 novos campos e setar atributos:

```js
var brand = 'terracota', density = 'normal', radius = 'default',
    style = 'boutique', font = 'default', bg = 'plain';
if (ap) {
  var p = JSON.parse(ap);
  if (p && typeof p === 'object') {
    if (p.brand) brand = p.brand;
    if (p.density) density = p.density;
    if (p.radius) radius = p.radius;
    if (p.style) style = p.style;
    if (p.font) font = p.font;
    if (p.bg) bg = p.bg;
  }
}
h.setAttribute('data-brand', brand);
h.setAttribute('data-density', density);
h.setAttribute('data-radius', radius);
h.setAttribute('data-style', style);
h.setAttribute('data-font', font);
h.setAttribute('data-bg', bg);
```

- [ ] **Step 2: Importar labels novos na página de Configurações**

Em `configuracoes/page.tsx`, ampliar o import de `@/lib/appearance` para incluir `STYLE_LABELS, FONT_LABELS, BG_LABELS` e os tipos `StylePreset, FontPreset, BgPreset`.

- [ ] **Step 3: Adicionar os 3 seletores no AppearanceSection**

Após o seletor "Cantos" (Radius), adicionar 3 `Field` no mesmo padrão dos botões existentes (`patch({ ... })`, classes `active`/inativo idênticas às atuais). Estilo com mini-preview visual; Fonte e Fundo como botões de texto:

```tsx
{/* Estilo */}
<Field label="Estilo">
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {(Object.keys(STYLE_LABELS) as StylePreset[]).map((s) => {
      const active = draft.style === s;
      return (
        <button
          key={s}
          onClick={() => patch({ style: s })}
          className={cn(
            'px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
            active
              ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
              : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
          )}
        >
          {STYLE_LABELS[s]}
        </button>
      );
    })}
  </div>
  <p className="text-[11px] text-ink-muted mt-2">
    Muda profundidade e superfícies do sistema. "Vidro" usa efeito translúcido.
  </p>
</Field>

{/* Fonte */}
<Field label="Fonte">
  <div className="flex gap-2">
    {(Object.keys(FONT_LABELS) as FontPreset[]).map((fk) => {
      const active = draft.font === fk;
      return (
        <button
          key={fk}
          onClick={() => patch({ font: fk })}
          className={cn(
            'flex-1 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
            active
              ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
              : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
          )}
        >
          {FONT_LABELS[fk]}
        </button>
      );
    })}
  </div>
</Field>

{/* Fundo */}
<Field label="Fundo">
  <div className="flex gap-2">
    {(Object.keys(BG_LABELS) as BgPreset[]).map((bk) => {
      const active = draft.bg === bk;
      return (
        <button
          key={bk}
          onClick={() => patch({ bg: bk })}
          className={cn(
            'flex-1 px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-all',
            active
              ? 'border-brand-400 bg-brand-50/60 text-ink dark:bg-white/[0.06]'
              : 'border-line text-ink-soft hover:border-brand-400/40 hover:text-ink',
          )}
        >
          {BG_LABELS[bk]}
        </button>
      );
    })}
  </div>
</Field>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: sem erro novo (os erros da Task 4 sobre campos obrigatórios em `DEFAULT_APPEARANCE`/`draft` agora resolvidos).

- [ ] **Step 5: Verificação manual completa**

`pnpm dev:web` → Configurações → Aparência: testar cada novo seletor, preview ao vivo, salvar, recarregar (persistiu, sem flash), "Restaurar padrão" (volta tudo). Conferir gating: logar como `receptionist` → seção Aparência some (já gated por `settings:manage`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/\(dashboard\)/configuracoes/page.tsx
git commit -m "feat(aparencia): seletores Estilo/Fonte/Fundo em Configurações + boot anti-flash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — Dashboard mais impactante

### Task 8: Repaginar os cards de KPI do /painel

**Files:**
- Modify: `apps/web/src/app/(dashboard)/painel/page.tsx`

- [ ] **Step 1: Card principal com destaque**

Transformar o card de KPI mais importante visível ao papel (Ocupação p/ todos; Receita p/ quem tem `expense:read`) num card com gradiente brand (`bg-gradient-brand` do tailwind ou `bg-brand-600 text-white`), ícone (lucide), valor grande e `sub` em opacidade menor. Demais KPIs em cards `surface-card` com ícone + cor brand sutil. Manter o gating da Task 3.

- [ ] **Step 2: Faixa de KPIs responsiva**

Garantir grid responsivo que se reorganiza quando os cards financeiros somem (ex: `grid grid-cols-2 lg:grid-cols-4 gap-3`, renderizando só os presentes).

- [ ] **Step 3: Typecheck + verificação visual**

Run: `pnpm typecheck` → sem erro novo. `pnpm dev:web` → /painel visivelmente mais marcante; testar nos 4 estilos (boutique/moderno/vidro/contraste) e em dark.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/painel/page.tsx
git commit -m "feat(painel): cards de KPI repaginados com destaque/gradiente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 9: Repaginar gráfico de ocupação + hierarquia do /painel

**Files:**
- Modify: `apps/web/src/app/(dashboard)/painel/page.tsx`

- [ ] **Step 1: Cabeçalho/saudação e seções**

Adicionar um header com saudação ("Olá" + nome da pousada/usuário do cache `['me']`) e melhorar a hierarquia (faixa KPIs → gráfico de ocupação → próximos check-ins/outs). Reusar `occupancySeries` no gráfico existente, repaginado (área/linha com cor brand, eixo limpo).

- [ ] **Step 2: Typecheck + verificação visual**

Run: `pnpm typecheck` → sem erro novo. Visual em light/dark, com e sem dados financeiros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/painel/page.tsx
git commit -m "feat(painel): hierarquia, saudação e gráfico de ocupação repaginados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — Redesign landing + login (fixo, fora do sistema de presets)

### Task 10: Redesign da landing (page.tsx)

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Confirmar fluxos a preservar**

Ler `page.tsx`. Identificar `handleSubscribe()` (POST `/subscriptions/create-preapproval` → redireciona pro `initPoint`) e os botões "Assinar" (primário) / "Entrar". NÃO alterar essa lógica — só o visual ao redor.

- [ ] **Step 2: Hero mais marcante**

Repaginar o hero: gradiente fixo da marca (terracota/dourado — NÃO usar `data-brand`, cores fixas via classes `brand-*` que aqui ficam na paleta default, ou hex fixos), tipografia display, composição com profundidade. Manter CTAs e seus handlers.

- [ ] **Step 3: Seções de recursos / prova social**

Repaginar as seções abaixo do hero com mais profundidade (cards, ícones, espaçamento), mantendo o conteúdo textual existente. Rodapé com links `/termos` e `/privacidade` preservados.

- [ ] **Step 4: Typecheck + verificação visual**

Run: `pnpm typecheck` → sem erro novo. `pnpm dev:web` → `/` mais impactante; clicar "Assinar" leva ao fluxo MP; "Entrar" leva ao login. A landing é escura por padrão (boot script) — confirmar que segue assim.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(landing): redesign visual do hero e seções (identidade fixa)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 11: Redesign do login

**Files:**
- Modify: caminho do login (confirmar: `apps/web/src/app/login/page.tsx` ou `apps/web/src/app/(auth)/login/page.tsx`).

- [ ] **Step 1: Localizar a página de login**

Run: `find apps/web/src/app -name "page.tsx" | grep -i login`
Abrir o arquivo encontrado; identificar o form e a lógica de auth (NÃO alterar).

- [ ] **Step 2: Layout mais marcante**

Repaginar para layout split (painel visual da marca + form) ou card centralizado com mais presença visual, mantendo campos, validação e submit intactos. Cores fixas da marca (não reage ao tema do tenant — usuário ainda não tem tenant no login).

- [ ] **Step 3: Typecheck + verificação visual**

Run: `pnpm typecheck` → sem erro novo. `pnpm dev:web` → login com visual novo; autenticar com credenciais válidas funciona e redireciona pro app.

- [ ] **Step 4: Commit**

```bash
git add <caminho-do-login>
git commit -m "feat(login): redesign visual da tela de acesso

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — Verificação final e deploy

### Task 12: Verificação integral

- [ ] **Step 1: Typecheck e testes**

Run: `pnpm typecheck` → sem erro NOVO (baseline ~21 ok).
Run: `pnpm --filter @adelina/api test` → todos passam (incl. `dashboard.access`).

- [ ] **Step 2: Matriz de verificação manual (descrever resultados no checkpoint)**

- Aparência: 11 cores, Estilo (4), Fonte (3), Fundo (3) — todos aplicam, preview ao vivo, persistem após reload, sem flash, "Restaurar padrão" funciona.
- RBAC: `owner`/`manager` veem Receita/ADR/RevPAR no /painel; `receptionist`/`housekeeper`/`readonly` **não** (UI) e a resposta de `GET /api/dashboard/summary` traz `monthRevenue/adr/revPar = null` p/ esses papéis (conferir via devtools/network).
- Dashboard: visual repaginado em light/dark e nos 4 estilos.
- Landing/login: visual novo, fluxos de assinatura e login intactos.

- [ ] **Step 3: Deploy (com cuidado de disco)**

Como a **API mudou** (Task 1-2), buildar os dois. Antes: `docker builder prune -af` (VPS ~93% cheia). Rodar `bash /root/adelina/deploy.sh`. **Conferir rollout de verdade:** comparar `docker inspect <container> --format '{{.Image}}'` com `docker image inspect adelina-{api,web}:latest --format '{{.Id}}'` — devem bater (ver gotcha em [[project-adelina]]: `--resolve-image never` não roda `:latest` reconstruído; deploy.sh já faz `docker service update --force`). Verificar api `Prisma connected`+`Nest started` e web 200.

- [ ] **Step 4: Merge da branch**

Após verificação, usar superpowers:finishing-a-development-branch para decidir merge/PR de `feat/aparencia-temas-dashboard`.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Frente 1 (temas): Tasks 4-7 (+6b condicional) — cores, style, font, bg, UI, boot. ✓
- Frente 2 (dashboard): Tasks 8-9. ✓
- Frente 3 (landing/login): Tasks 10-11. ✓
- Frente 4 (RBAC): Tasks 1-3. ✓

**Placeholders:** redesign visual (Tasks 8-11) é inerentemente iterativo — descrito por estrutura/intenção + verificação, não por código pixel-a-pixel (apropriado p/ trabalho de design; TDD não se aplica a CSS puro). Lógica testável (RBAC servidor) tem teste real.

**Consistência de tipos:** `Appearance`/`BrandPreset`/`StylePreset`/`FontPreset`/`BgPreset`, `redactFinancials`, `can('expense:read')`, `useCan()` usados de forma consistente entre tasks. `monthRevenue/adr/revPar` viram `| null` tanto no servidor (Task 1/2) quanto no tipo do front (Task 3).
