# Aparência expandida + Dashboard impactante + Redesign landing/login — Design

> Data: 2026-06-24 · Status: aprovado (brainstorming) · Repo: `pkthegoat7/ADELINE` (branch `feat/aparencia-temas-dashboard`)

## Objetivo

O dono quer (1) **mais opções de aparência** e um visual **mais impactante** no app, e (2) garantir que **cada cargo (RBAC) está vendo só o que deve**. O sistema de aparência já existe e funciona (tokens CSS por `data-*`, preview ao vivo, persistência em `tenant.appearance` Json via `PATCH /me/appearance`, gated por `settings:manage`); este trabalho **estende** esse padrão — sem libs novas, sem refatorar a arquitetura, sem migração de banco.

São quatro frentes, sendo a #4 um conserto pontual de RBAC descoberto na auditoria.

## Escopo / não-escopo

- **NÃO** tornar a landing/login configuráveis pelo tenant — elas mantêm a identidade Adelina **fixa**. O sistema de presets/temas aplica **só ao app logado**.
- **NÃO** introduzir CSS-in-JS, design system externo, nem mudar a stack.
- **NÃO** alterar a matriz de papéis nem adicionar capacidades novas (a #4 reusa `expense:read`).

## Estado atual (referência)

- `apps/web/src/lib/appearance.ts` — interface `Appearance { brand, density, radius, theme? }`, `DEFAULT_APPEARANCE`, `BRAND_PRESETS` (6 cores), `normalizeAppearance`, `applyToHtml` (seta `data-brand/density/radius`), `useUpdateAppearance` (PATCH `/me/appearance`, otimista), `useAppearanceSync`.
- `apps/web/src/app/layout.tsx` — script inline aplica `data-brand/density/radius` no `<html>` no boot.
- `apps/web/src/app/globals.css` — tokens em `:root`/`.dark`, presets `html[data-brand="..."]`, `html[data-density="..."]`, `html[data-radius="..."]`.
- `apps/web/src/app/(dashboard)/configuracoes/page.tsx` — `AppearanceSection` (gated `can('settings:manage')`) com seletores Tema/Cor/Densidade/Cantos.
- `apps/web/src/app/(dashboard)/painel/page.tsx` — KPIs incl. Receita do mês / ADR / RevPAR (**sem** check de capability — ver Frente 4).
- Tema claro/escuro = `lib/theme.ts` (per-browser, localStorage). Brand/density/radius = per-tenant (Json no banco).

## Frente 1 — Sistema de temas expandido (app logado)

A interface `Appearance` ganha três eixos novos, todos opcionais com default seguro (campo Json no banco → **zero migração**; `normalizeAppearance` valida cada um contra sua tabela de labels e cai no default se inválido):

```ts
style: StylePreset;   // bundle curado de superfície/sombra/blur/fundo
font:  FontPreset;    // família tipográfica
bg:    BgPreset;      // tratamento de fundo do app
```

### 1a. Mais cores (`data-brand`)
Adicionar **5 presets** a `BRAND_PRESETS` e a `globals.css` (rampa de 11 tons cada, mesmo padrão dos existentes):

| key | label | hex base (500) |
|-----|-------|----------------|
| `amber` | Âmbar | `#d97706` |
| `teal` | Teal | `#0d9488` |
| `indigo` | Índigo | `#4f46e5` |
| `fuchsia` | Fúcsia | `#c026d3` |
| `wine` | Vinho | `#9f1239` |

Total: 11 cores. Grid de cores em Configurações já é responsivo (`grid-cols-3 sm:grid-cols-6`) — só cresce.

### 1b. Fonte (`data-font`)
`FontPreset = 'default' | 'elegante' | 'compacta'`. Em `globals.css`, `html[data-font="..."]` sobrescreve `--font-display`/`--font-inter` (e ajuste fino de `letter-spacing`). Reusa as fontes já carregadas via `next/font` no `layout.tsx`; se "Elegante" exigir uma serifada display nova, carregá-la no `layout.tsx` ao lado das atuais. Labels: Padrão / Elegante / Compacta.

### 1c. Fundo (`data-bg`)
`BgPreset = 'plain' | 'gradient' | 'texture'`. `html[data-bg="..."]` aplica ao `body`/superfície base: `plain` (atual), `gradient` (usa `bg-gradient-warm` já no tailwind), `texture` (overlay `bg-noise` sutil já definido no tailwind). Não afeta legibilidade (opacidade baixa, respeita dark).

### 1d. Estilos curados (`data-style`) — o "mais impactante"
`StylePreset = 'boutique' | 'moderno' | 'vidro' | 'contraste'`. Cada um, via `html[data-style="..."]` em `globals.css`, ajusta variáveis de **superfície, linhas, sombra e blur** (NÃO a cor brand — essa é eixo próprio):

- **boutique** — atual (creme/sombra suave). Default.
- **moderno** — sombras mais fortes (`--shadow`), cards com mais elevação e contraste de linha.
- **vidro** — glassmorphism: superfícies translúcidas + `backdrop-blur`, bordas claras. Variante dark inclusa.
- **contraste** — alto contraste p/ acessibilidade: linhas e texto mais fortes, sombra mínima.

Componentes (`surface-card`, botões, etc.) já consomem as variáveis de superfície/sombra; mudar as vars no `data-style` propaga sem tocar componente a componente. Casos pontuais que precisam de blur (`vidro`) usam utilitário condicional via seletor `[data-style="vidro"] .surface-card { ... }`.

### 1e. Wiring
- `appearance.ts`: estender `Appearance`, `DEFAULT_APPEARANCE` (`style:'boutique'`, `font:'default'`, `bg:'plain'`), `STYLE_LABELS`/`FONT_LABELS`/`BG_LABELS`, `normalizeAppearance` (valida os 3 novos), `applyToHtml` (seta `data-style/font/bg`).
- `layout.tsx`: script de boot seta os 3 novos atributos (evita flash).
- `configuracoes/page.tsx` `AppearanceSection`: novos seletores **Estilo** (cards com mini-preview), **Fonte**, **Fundo**. Continua gated `settings:manage`. "Restaurar padrão" reseta tudo.

## Frente 2 — Dashboard mais impactante (`/painel`)

Redesign visual do `/painel` mantendo os mesmos dados/endpoint:
- **Cards de KPI** repaginados: destaque com gradiente brand no card principal, ícone, e mini-indicador de tendência onde houver série.
- **Hierarquia**: título/saudação, faixa de KPIs, gráfico de ocupação repaginado (reusa `occupancySeries`), próximos check-ins/outs.
- Usa os tokens novos (responde a `data-style`/`data-bg`).
- **Sem novos endpoints** além do ajuste de RBAC da Frente 4.

## Frente 3 — Redesign landing + login (fixo)

Glow-up visual **independente do sistema de presets** (identidade Adelina fixa):
- **Landing** (`apps/web/src/app/page.tsx`): hero mais marcante (gradiente, tipografia display, composição), seções de recursos/prova social com mais profundidade, CTAs ("Assinar"/"Entrar") preservados e funcionais (fluxo MP de assinatura intacto).
- **Login**: layout mais marcante (split/visual), mantendo o fluxo de auth atual.
- Não introduz dependência no `data-brand` do tenant; cores fixas da marca.

## Frente 4 — Conserto RBAC (visibilidade financeira no /painel)

**Furo:** `/painel` está no menu base (todos os cargos) e exibe **Receita do mês, ADR, RevPAR** sem checar capability → `receptionist`/`housekeeper`/`readonly` veem o faturamento, contrariando a matriz (financeiro = owner/manager via `expense:read`).

**Correção em duas camadas (defesa em profundidade):**
1. **UI** (`painel/page.tsx`): widgets de Receita/ADR/RevPAR só renderizam com `can('expense:read')`. Demais KPIs (ocupação, check-ins) seguem visíveis a todos. Layout se reorganiza graciosamente quando ocultos.
2. **Servidor** (controller/service do dashboard): omitir/zerar os campos financeiros (`monthRevenue`, ADR, RevPAR) na resposta quando o papel não tem `expense:read`. Verificar se há `@RequireCapability` aplicável ou se o cálculo deve ser condicional ao papel do `req.user`.

Restante da auditoria: gating consistente, espelho api↔web sincronizado, sem outros furos. (Observação UX, fora de escopo: `Configurações`/`Canais` aparecem pra cargos baixos mas já só mostram seções de leitura.)

## Riscos / pegadinhas

- **Flash de tema no boot**: novos `data-*` precisam estar no script inline do `layout.tsx`, senão pisca no carregamento.
- **`vidro` + dark**: glassmorphism precisa de variante dark testada (translucidez sobre fundo escuro).
- **Fonte nova**: se "Elegante" exigir webfont nova, pesa no carregamento — preferir `next/font` com `display:swap` e subset latin.
- **Deploy/disco**: VPS ~93% cheia; build do web é pesado. Buildar **só o web** (`docker build -f apps/web/Dockerfile … -t adelina-web:latest .` + `docker service update --force --image adelina-web:latest adelina_web`) se a API não mudar. A Frente 4 mexe na API → nesse caso build dos dois (rodar `docker builder prune -af` antes). Ver [[project-adelina]] gotcha de disco/rollout (`docker service update --force` obrigatório, conferir image ID).
- **RBAC**: ao tocar capability, lembrar dos DOIS espelhos — aqui não muda a matriz, só aplica `expense:read` num lugar que faltava.

## Critérios de sucesso

- Configurações → Aparência oferece: Tema, **11 cores**, Densidade, Cantos, **Estilo**, **Fonte**, **Fundo**; preview ao vivo; salva no tenant; persiste após reload; sem flash.
- `/painel` visivelmente mais impactante; responde aos temas.
- Landing + login com visual novo marcante; fluxos de assinatura/login intactos.
- `receptionist`/`housekeeper`/`readonly` **não** veem Receita/ADR/RevPAR (nem na UI nem na resposta da API); owner/manager veem.
- `pnpm typecheck` sem erros novos (baseline ~21 pré-existentes ignorado); testes vitest existentes passam.
