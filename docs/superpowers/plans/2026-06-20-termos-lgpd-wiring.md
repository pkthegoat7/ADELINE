# Wiring de Termos de Uso + LGPD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar Termos de Uso e Política de Privacidade no ar (páginas públicas), capturar consentimento rastreável dos novos assinantes no checkout, e tornar os dados da empresa editáveis pelo super-admin.

**Architecture:** Módulo `legal` no **API** (NestJS) é dono do conteúdo markdown canônico e da substituição de tokens dos dados da empresa (lidos de `system_settings`), exposto por endpoint público `GET /api/legal/:doc`. O **web** (Next 15) é só renderizador (markdown→HTML via `marked`). Consentimento gravado no `User` via migração aditiva + captura no `activate()`.

**Tech Stack:** NestJS 10 + Fastify + Prisma 5 + Zod + vitest (API); Next.js 15 App Router + Tailwind + `marked` (web); Postgres com RLS multi-tenant.

> **Refinamento do spec (`2026-06-20-termos-lgpd-wiring-design.md`):** o conteúdo legal e a substituição de tokens vivem no **API** (não no web) porque o API já tem vitest (precedente `payouts.calc.spec.ts`), tornando a lógica de substituição testável por TDD. O endpoint público é `GET /api/legal/:doc` retornando markdown já substituído (em vez de `GET /api/legal/company-info` cru). Web continua thin. Demais decisões do spec inalteradas.

> **Política de testes:** este repo só tem testes de função pura (vitest, sem harness Nest/integração). TDD se aplica à **Task 1** (substituição de tokens — função pura). As demais tasks (migração, wiring de controller, UI) usam verificação por build + smoke manual, conforme a convenção do repo. Não construir harness de integração (fora de escopo).

---

## Estrutura de arquivos

**Criar:**
- `apps/api/src/modules/legal/legal.tokens.ts` — função pura `substituteTokens` + mapa de tokens + `LEGAL_DOC_VERSION`.
- `apps/api/src/modules/legal/legal.tokens.spec.ts` — testes vitest.
- `apps/api/src/modules/legal/content/termos.md` — conteúdo canônico (Termos).
- `apps/api/src/modules/legal/content/privacidade.md` — conteúdo canônico (Privacidade).
- `apps/api/src/modules/legal/legal.service.ts` — lê markdown + settings, substitui.
- `apps/api/src/modules/legal/legal.controller.ts` — `GET /api/legal/:doc` público.
- `apps/api/src/modules/legal/legal.module.ts`
- `apps/web/src/app/termos/page.tsx`
- `apps/web/src/app/privacidade/page.tsx`
- `apps/web/src/lib/legal.ts` — fetch + render markdown→HTML.
- `packages/db/prisma/migrations/20260620000000_user_consent/migration.sql`

**Modificar:**
- `apps/api/src/app.module.ts` — registrar `LegalModule`.
- `apps/api/src/modules/admin/admin.controller.ts` — chaves `legal_*` em `ALLOWED_SETTINGS`/validação/`DELETABLE_SETTINGS`.
- `apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx` — seção "Dados da empresa".
- `apps/web/src/middleware.ts` — allowlist `/termos`, `/privacidade`.
- `apps/web/src/app/page.tsx` — links no rodapé.
- `apps/web/src/app/checkout/sucesso/page.tsx` — checkbox de aceite.
- `apps/web/package.json` — dep `marked`.
- `packages/db/prisma/schema.prisma` — campos de consentimento no `User`.
- `apps/api/src/modules/subscriptions/subscriptions.controller.ts` — `acceptedTerms` + IP.
- `apps/api/src/modules/subscriptions/subscriptions.service.ts` — gravar consentimento.
- `apps/api/src/common/tenant-settings.service.ts` — defaults LGPD melhorados.
- `docs/legal/{termos-de-uso,politica-de-privacidade}.md` — aviso de que a fonte canônica mudou.

---

## Task 1: Substituição de tokens (função pura, TDD)

**Files:**
- Create: `apps/api/src/modules/legal/legal.tokens.ts`
- Test: `apps/api/src/modules/legal/legal.tokens.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/api/src/modules/legal/legal.tokens.spec.ts
import { describe, it, expect } from 'vitest';
import { substituteTokens, LEGAL_TOKEN_KEYS, placeholderFor } from './legal.tokens';

describe('substituteTokens', () => {
  it('substitui token conhecido pelo valor fornecido', () => {
    const out = substituteTokens('Empresa: {{razaoSocial}}.', { legal_company_name: 'Pousada LTDA' });
    expect(out).toBe('Empresa: Pousada LTDA.');
  });

  it('usa placeholder visível quando o valor está ausente ou vazio', () => {
    const out = substituteTokens('CNPJ: {{cnpj}}.', {});
    expect(out).toBe(`CNPJ: ${placeholderFor('cnpj')}.`);
    expect(out).not.toContain('{{cnpj}}');
  });

  it('escapa HTML nos valores substituídos', () => {
    const out = substituteTokens('{{razaoSocial}}', { legal_company_name: '<script>x</script>' });
    expect(out).toBe('&lt;script&gt;x&lt;/script&gt;');
  });

  it('substitui todas as ocorrências do mesmo token', () => {
    const out = substituteTokens('{{cnpj}} / {{cnpj}}', { legal_cnpj: '00.000.000/0001-00' });
    expect(out).toBe('00.000.000/0001-00 / 00.000.000/0001-00');
  });

  it('mantém texto sem tokens intacto', () => {
    expect(substituteTokens('Sem tokens aqui.', {})).toBe('Sem tokens aqui.');
  });

  it('expõe todos os tokens conhecidos mapeados para uma chave de setting', () => {
    expect(LEGAL_TOKEN_KEYS.razaoSocial).toBe('legal_company_name');
    expect(Object.keys(LEGAL_TOKEN_KEYS)).toContain('emailDpo');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @adelina/api test legal.tokens`
Expected: FAIL — "Cannot find module './legal.tokens'".

- [ ] **Step 3: Implementação mínima**

```ts
// apps/api/src/modules/legal/legal.tokens.ts

/** Versão atual dos documentos legais; gravada no consentimento do usuário. */
export const LEGAL_DOC_VERSION = '1.0';

/** token de template (no markdown) → chave em system_settings. */
export const LEGAL_TOKEN_KEYS = {
  razaoSocial: 'legal_company_name',
  cnpj: 'legal_cnpj',
  endereco: 'legal_address',
  cidadeUf: 'legal_city_state',
  emailSuporte: 'legal_support_email',
  nomeDpo: 'legal_dpo_name',
  emailDpo: 'legal_dpo_email',
  foro: 'legal_jurisdiction',
  prazoRetencao: 'legal_data_retention',
  provedorNuvem: 'legal_cloud_provider',
} as const;

export type LegalToken = keyof typeof LEGAL_TOKEN_KEYS;

const PLACEHOLDER_LABEL: Record<LegalToken, string> = {
  razaoSocial: 'razão social',
  cnpj: 'CNPJ',
  endereco: 'endereço',
  cidadeUf: 'cidade/UF',
  emailSuporte: 'e-mail de suporte',
  nomeDpo: 'encarregado (DPO)',
  emailDpo: 'e-mail do encarregado',
  foro: 'foro',
  prazoRetencao: 'prazo de retenção',
  provedorNuvem: 'provedor de nuvem',
};

/** Marcador visível para token sem valor preenchido. */
export function placeholderFor(token: LegalToken): string {
  return `〔${PLACEHOLDER_LABEL[token]} a preencher〕`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Substitui `{{token}}` no markdown pelo valor de system_settings (escapado),
 * ou por um placeholder visível quando ausente/vazio.
 */
export function substituteTokens(markdown: string, settings: Record<string, string>): string {
  let out = markdown;
  for (const token of Object.keys(LEGAL_TOKEN_KEYS) as LegalToken[]) {
    const settingKey = LEGAL_TOKEN_KEYS[token];
    const raw = (settings[settingKey] ?? '').trim();
    const value = raw ? escapeHtml(raw) : placeholderFor(token);
    out = out.split(`{{${token}}}`).join(value);
  }
  return out;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @adelina/api test legal.tokens`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/legal/legal.tokens.ts apps/api/src/modules/legal/legal.tokens.spec.ts
git commit -m "feat(legal): substituição de tokens dos dados da empresa (função pura + testes)"
```

---

## Task 2: Conteúdo canônico + service + controller público

**Files:**
- Create: `apps/api/src/modules/legal/content/termos.md`, `.../content/privacidade.md`
- Create: `apps/api/src/modules/legal/legal.service.ts`, `.../legal.controller.ts`, `.../legal.module.ts`
- Modify: `apps/api/src/app.module.ts`, `docs/legal/*.md`

- [ ] **Step 1: Mover o conteúdo e converter para tokens**

Copiar o corpo das minutas para os arquivos de conteúdo:

```bash
mkdir -p apps/api/src/modules/legal/content
cp docs/legal/termos-de-uso.md apps/api/src/modules/legal/content/termos.md
cp docs/legal/politica-de-privacidade.md apps/api/src/modules/legal/content/privacidade.md
```

Em **ambos** os arquivos de `content/`, editar:
1. Remover o bloco de aviso `> ⚠️ **Aviso:** Este documento é uma minuta-modelo...` (não vai ao público; o disclaimer de "revisar por advogado" sai do corpo).
2. Substituir os marcadores de identificação da empresa pelos tokens, conforme o mapa:

| Marcador atual | Token |
|---|---|
| `[RAZÃO SOCIAL DA EMPRESA]`, `[RAZÃO SOCIAL]` | `{{razaoSocial}}` |
| `[CNPJ]` | `{{cnpj}}` |
| `[ENDEREÇO COMPLETO]`, `[ENDEREÇO]` | `{{endereco}}` |
| `[CIDADE/UF]` | `{{foro}}` |
| `[E-MAIL DE SUPORTE]` | `{{emailSuporte}}` |
| `[NOME DO ENCARREGADO/DPO]`, `[NOME]` | `{{nomeDpo}}` |
| `[E-MAIL DO ENCARREGADO, ex.: privacidade@adelina.com.br]`, `[E-MAIL DO ENCARREGADO]` | `{{emailDpo}}` |
| `[PRAZO, ex.: 90 dias]`, `[PRAZO]` | `{{prazoRetencao}}` |
| `[PROVEDOR DE NUVEM, ex.: Contabo/servidor próprio]`, `[PROVEDOR DE NUVEM]` | `{{provedorNuvem}}` |

3. Casos editoriais (substituir pelo texto indicado, **não** por token):
   - `[Política de Privacidade]` → `[Política de Privacidade](/privacidade)` (link markdown).
   - `[VALOR]` → `o valor vigente informado no momento da contratação`.
   - `[WHATSAPP/HORÁRIO]` → `os canais de suporte informados`.
   - `[PROVEDOR DE E-MAIL/WHATSAPP, se houver]`, `[PROVEDOR DE E-MAIL/WHATSAPP]` → `provedor de e-mail/mensageria, quando aplicável`.
   - `[Listar se aplicável; se tudo for hospedado no Brasil, declarar que não há transferência internacional.]` → `Os dados são hospedados em servidores localizados no Brasil; não há transferência internacional de dados.`

4. Conferir que não restou nenhum `[` de marcador: `grep -nF '[' apps/api/src/modules/legal/content/*.md` não deve listar marcadores de placeholder (links markdown `](...)` são esperados).

- [ ] **Step 2: Marcar as cópias antigas como não-canônicas**

No topo de `docs/legal/termos-de-uso.md` e `docs/legal/politica-de-privacidade.md`, logo após o título, inserir:

```markdown
> **Nota:** a fonte canônica deste documento agora é `apps/api/src/modules/legal/content/`, servida em produção via `GET /api/legal/:doc`. Edite lá. Este arquivo permanece como referência histórica da minuta.
```

- [ ] **Step 3: Garantir que os .md são empacotados no build do API**

Os arquivos `.md` precisam existir no runtime. O Nest compila para `dist/` sem copiar `.md` por padrão. Ler os arquivos por caminho relativo ao **source em runtime** usando `process.cwd()` + caminho do source não é confiável. Estratégia: ler via caminho resolvido a partir de `__dirname` apontando para o source, e copiar o `content/` no build.

Adicionar ao `apps/api/package.json` no script de build a cópia do conteúdo (ajustar ao script existente; se o build for `nest build`, acrescentar `&& cp -r src/modules/legal/content dist/modules/legal/content`):

```bash
# inspecionar primeiro
grep -n '"build"' apps/api/package.json
```

Editar o script `build` para terminar com `&& mkdir -p dist/modules/legal && cp -r src/modules/legal/content dist/modules/legal/content`.

- [ ] **Step 4: Implementar o service**

```ts
// apps/api/src/modules/legal/legal.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { substituteTokens, LEGAL_DOC_VERSION, LEGAL_TOKEN_KEYS } from './legal.tokens';

const DOCS: Record<string, { file: string; title: string }> = {
  termos: { file: 'termos.md', title: 'Termos de Uso' },
  privacidade: { file: 'privacidade.md', title: 'Política de Privacidade' },
};

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async render(doc: string): Promise<{ title: string; markdown: string; version: string }> {
    const meta = DOCS[doc];
    if (!meta) throw new NotFoundException('Documento não encontrado.');

    const raw = readFileSync(join(__dirname, 'content', meta.file), 'utf8');

    const keys = Object.values(LEGAL_TOKEN_KEYS);
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: keys } } });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return { title: meta.title, markdown: substituteTokens(raw, settings), version: LEGAL_DOC_VERSION };
  }
}
```

- [ ] **Step 5: Implementar o controller público**

```ts
// apps/api/src/modules/legal/legal.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { LegalService } from './legal.service';

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get(':doc')
  async getDoc(@Param('doc') doc: string) {
    return this.legal.render(doc);
  }
}
```

- [ ] **Step 6: Módulo + registro**

```ts
// apps/api/src/modules/legal/legal.module.ts
import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

@Module({
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
```

Em `apps/api/src/app.module.ts`: importar `LegalModule` e adicioná-lo ao array `imports` (seguir a ordem dos demais módulos; colocar perto de `SubscriptionsModule`). PrismaService já é global (via PrismaModule) — confirmar; se não for global, ler como os outros módulos injetam PrismaService e replicar.

- [ ] **Step 7: Build e smoke test local**

Run:
```bash
pnpm --filter @adelina/api build
pnpm --filter @adelina/api start &   # ou o dev runner; aguardar subir na :3333
curl -s http://localhost:3333/api/legal/termos | head -c 300
curl -s http://localhost:3333/api/legal/privacidade | head -c 300
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/api/legal/inexistente   # espera 404
```
Expected: JSON com `title`, `markdown` (tokens já substituídos por placeholders `〔…〕` já que settings vazios) e `version: "1.0"`; rota inexistente retorna 404. Encerrar o processo após.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/legal apps/api/src/app.module.ts apps/api/package.json docs/legal
git commit -m "feat(legal): módulo legal (conteúdo canônico + GET /api/legal/:doc público)"
```

---

## Task 3: Dados da empresa no super-admin (backend)

**Files:**
- Modify: `apps/api/src/modules/admin/admin.controller.ts:174-231`

- [ ] **Step 1: Adicionar as chaves a `ALLOWED_SETTINGS`**

Em `admin.controller.ts`, acrescentar ao array `ALLOWED_SETTINGS` (após `mp_plan_promo_label`):

```ts
    'legal_company_name',
    'legal_cnpj',
    'legal_address',
    'legal_city_state',
    'legal_support_email',
    'legal_dpo_name',
    'legal_dpo_email',
    'legal_jurisdiction',
    'legal_data_retention',
    'legal_cloud_provider',
```

- [ ] **Step 2: Permitir limpar (deletar) os campos legais**

Adicionar as mesmas 10 chaves ao `DELETABLE_SETTINGS` (Set), para que o super-admin possa limpar um campo e voltar ao placeholder.

- [ ] **Step 3: Validação leve no `upsertSetting`**

Em `upsertSetting`, antes do `upsert`, acrescentar:

```ts
    if ((key === 'legal_support_email' || key === 'legal_dpo_email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      throw new BadRequestException('E-mail inválido.');
    }
    if (key.startsWith('legal_') && value.length > 500) {
      throw new BadRequestException('Valor muito longo (máx. 500 caracteres).');
    }
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @adelina/api build`
Expected: build OK (SWC ignora erros de tsc pré-existentes não relacionados).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin.controller.ts
git commit -m "feat(admin): chaves legal_* (dados da empresa) editáveis no super-admin"
```

---

## Task 4: Seção "Dados da empresa" no painel super-admin (UI)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx`

- [ ] **Step 1: Adicionar a seção ao componente raiz**

Em `AdminConfiguracoes`, após `<PlanoSection />` (linha ~48), inserir `<DadosEmpresaSection />`.

- [ ] **Step 2: Implementar `DadosEmpresaSection`**

Seguir o padrão de `PlanoSection` (estado local por campo, `api('/admin/settings', { method: 'PUT', body })` por campo, `toast` do `sonner`). Adicionar no fim do arquivo:

```tsx
const LEGAL_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'legal_company_name', label: 'Razão social', placeholder: 'Ex: Pousada Sol LTDA' },
  { key: 'legal_cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  { key: 'legal_address', label: 'Endereço completo', placeholder: 'Rua, nº, bairro, cidade/UF, CEP' },
  { key: 'legal_city_state', label: 'Foro (cidade/UF)', placeholder: 'Ex: São Paulo/SP' },
  { key: 'legal_support_email', label: 'E-mail de suporte', placeholder: 'suporte@suaempresa.com.br' },
  { key: 'legal_dpo_name', label: 'Encarregado (DPO)', placeholder: 'Nome do responsável LGPD' },
  { key: 'legal_dpo_email', label: 'E-mail do encarregado', placeholder: 'privacidade@suaempresa.com.br' },
  { key: 'legal_jurisdiction', label: 'Comarca do foro', placeholder: 'Ex: Comarca de São Paulo/SP' },
  { key: 'legal_data_retention', label: 'Prazo de retenção de dados', placeholder: 'Ex: 90 dias após o término' },
  { key: 'legal_cloud_provider', label: 'Provedor de nuvem', placeholder: 'Ex: Contabo / servidor próprio' },
];

function DadosEmpresaSection() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api<{ key: string; value: string }[]>('/admin/settings')
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const r of rows) if (r.key.startsWith('legal_')) map[r.key] = r.value;
        setValues(map);
      })
      .catch(() => {});
  }, []);

  async function save(key: string) {
    const value = (values[key] ?? '').trim();
    setSaving(key);
    try {
      if (value) {
        await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) });
      } else {
        await api(`/admin/settings/${key}`, { method: 'DELETE' });
      }
      toast.success('Salvo', 'Os documentos legais refletem a mudança.');
    } catch (e) {
      toast.error('Erro ao salvar', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="surface-card p-6">
      <h3 className="font-semibold text-ink">Dados da empresa (documentos legais)</h3>
      <p className="text-sm text-ink-soft mt-1 mb-4">
        Preenchem os Termos de Uso e a Política de Privacidade. Campos vazios aparecem como
        “〔a preencher〕” nas páginas públicas.
      </p>
      <div className="space-y-3">
        {LEGAL_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink mb-1">{f.label}</label>
              <input
                className="input-base"
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="btn-secondary px-4 py-2 text-sm"
              disabled={saving === f.key}
              onClick={() => save(f.key)}
            >
              {saving === f.key ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Confirmar os imports no topo do arquivo: `useState`, `useEffect` de `react`; `api` de `@/lib/api`; `toast` de `sonner`. Adicionar os que faltarem.

- [ ] **Step 3: Build do web**

Run: `pnpm --filter @adelina/web build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx"
git commit -m "feat(admin-ui): seção de dados da empresa para os documentos legais"
```

---

## Task 5: Páginas públicas `/termos` e `/privacidade` + middleware + links

**Files:**
- Modify: `apps/web/package.json` (dep `marked`)
- Create: `apps/web/src/lib/legal.ts`, `apps/web/src/app/termos/page.tsx`, `apps/web/src/app/privacidade/page.tsx`
- Modify: `apps/web/src/middleware.ts`, `apps/web/src/app/page.tsx`

- [ ] **Step 1: Instalar `marked`**

Run: `pnpm --filter @adelina/web add marked`
Expected: `marked` adicionado ao `apps/web/package.json`.

- [ ] **Step 2: Helper de fetch + render**

```ts
// apps/web/src/lib/legal.ts
import { marked } from 'marked';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function fetchLegalDoc(doc: 'termos' | 'privacidade') {
  const res = await fetch(`${API}/api/legal/${doc}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Falha ao carregar o documento.');
  const data = (await res.json()) as { title: string; markdown: string; version: string };
  const html = marked.parse(data.markdown, { async: false }) as string;
  return { ...data, html };
}
```

- [ ] **Step 3: Página `/termos`**

```tsx
// apps/web/src/app/termos/page.tsx
import { fetchLegalDoc } from '@/lib/legal';

export const dynamic = 'force-dynamic';

export default async function TermosPage() {
  const { title, html, version } = await fetchLegalDoc('termos');
  return <LegalLayout title={title} html={html} version={version} />;
}

export function LegalLayout({ title, html, version }: { title: string; html: string; version: string }) {
  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <a href="/" className="text-sm text-ink-muted hover:text-ink">← Voltar ao início</a>
        <h1 className="font-display text-3xl font-bold text-ink mt-4 mb-6">{title}</h1>
        <article
          className="prose prose-stone dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="text-xs text-ink-muted mt-10">Versão {version}</p>
      </div>
    </main>
  );
}
```

(Se o projeto não tiver o plugin `@tailwindcss/typography`/classe `prose`, trocar `className` do `<article>` por estilos manuais de leitura: `className="space-y-4 text-ink-soft leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_h2]:mt-8 [&_h2]:mb-2 [&_a]:text-brand [&_a]:underline"`. Verificar com `grep -r "@tailwindcss/typography\|prose" apps/web` antes; usar o fallback se não existir.)

- [ ] **Step 4: Página `/privacidade`**

```tsx
// apps/web/src/app/privacidade/page.tsx
import { fetchLegalDoc } from '@/lib/legal';
import { LegalLayout } from '../termos/page';

export const dynamic = 'force-dynamic';

export default async function PrivacidadePage() {
  const { title, html, version } = await fetchLegalDoc('privacidade');
  return <LegalLayout title={title} html={html} version={version} />;
}
```

- [ ] **Step 5: Allowlist no middleware**

Em `apps/web/src/middleware.ts`, no bloco `isPublicForm` (linhas 27-31), acrescentar as rotas:

```ts
    pathname.startsWith('/termos') ||
    pathname.startsWith('/privacidade') ||
```

- [ ] **Step 6: Links no rodapé da landing**

Em `apps/web/src/app/page.tsx`, localizar o rodapé (`grep -n "footer\|©\|Todos os direitos" apps/web/src/app/page.tsx`) e adicionar dois links:

```tsx
<a href="/termos" className="hover:text-ink">Termos de Uso</a>
<a href="/privacidade" className="hover:text-ink">Política de Privacidade</a>
```

(Se não houver rodapé, adicionar um `<footer>` simples ao final do `<main>` com esses links + copyright.)

- [ ] **Step 7: Build e smoke test**

Run:
```bash
pnpm --filter @adelina/web build
```
Expected: build OK; rotas `/termos` e `/privacidade` listadas como dinâmicas.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/legal.ts apps/web/src/app/termos apps/web/src/app/privacidade apps/web/src/middleware.ts apps/web/src/app/page.tsx
git commit -m "feat(web): páginas públicas /termos e /privacidade + links no rodapé"
```

---

## Task 6: Migração — colunas de consentimento no `users`

**Files:**
- Modify: `packages/db/prisma/schema.prisma:94-111`
- Create: `packages/db/prisma/migrations/20260620000000_user_consent/migration.sql`

- [ ] **Step 1: Campos no model `User`**

Em `schema.prisma`, no model `User`, após `updatedAt` (linha ~104), adicionar:

```prisma
  termsAcceptedAt   DateTime? @map("terms_accepted_at")
  privacyAcceptedAt DateTime? @map("privacy_accepted_at")
  consentIp         String?   @map("consent_ip")
  consentDocVersion String?   @map("consent_doc_version")
```

- [ ] **Step 2: Migration file aditiva**

```sql
-- packages/db/prisma/migrations/20260620000000_user_consent/migration.sql
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "privacy_accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consent_ip"          TEXT,
  ADD COLUMN IF NOT EXISTS "consent_doc_version" TEXT;
```

- [ ] **Step 3: Gerar o Prisma client**

Run: `pnpm db:generate`
Expected: client regenerado sem erro; tipos de `User` incluem os novos campos.

- [ ] **Step 4: Commit (sem aplicar no prod ainda)**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260620000000_user_consent
git commit -m "feat(db): colunas de consentimento (termos/privacidade) no model User"
```

> A aplicação no prod acontece na Task 9, via SQL manual `--single-transaction`. **NUNCA** `prisma db push` neste prod.

---

## Task 7: Captura de consentimento no `activate()`

**Files:**
- Modify: `apps/api/src/modules/subscriptions/subscriptions.controller.ts:11-17,53-61`
- Modify: `apps/api/src/modules/subscriptions/subscriptions.service.ts:204-294`

- [ ] **Step 1: `acceptedTerms` no schema do controller**

Em `subscriptions.controller.ts`, no `ActivateSchema`, adicionar:

```ts
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' }),
  }),
```

- [ ] **Step 2: Ler o IP e repassar ao service**

Trocar a assinatura e o corpo do handler `activate` (substituir importação de tipos do Fastify para incluir `FastifyRequest`):

```ts
// import no topo:
import type { FastifyReply, FastifyRequest } from 'fastify';

  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('activate')
  async activate(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const data = ActivateSchema.parse(body);
    const { token } = await this.subscriptions.activate({ ...data, consentIp: req.ip });
    res.header('Set-Cookie', this.auth.sessionCookie(token));
    return { ok: true, redirect: '/dashboard' };
  }
```

Adicionar `Req` ao import de `@nestjs/common` (linha 1).

- [ ] **Step 3: Gravar o consentimento no service**

Em `subscriptions.service.ts`:

1. Import no topo: `import { LEGAL_DOC_VERSION } from '../legal/legal.tokens';`
2. Estender o tipo do parâmetro de `activate` (linha 204) com:
   ```ts
       acceptedTerms: true;
       consentIp: string;
   ```
3. No `tx.user.create` (linha ~270), acrescentar ao `data`:
   ```ts
           termsAcceptedAt: now,
           privacyAcceptedAt: now,
           consentIp: input.consentIp,
           consentDocVersion: LEGAL_DOC_VERSION,
   ```
   (`now` já está definido na linha 247.)

- [ ] **Step 4: Build**

Run: `pnpm --filter @adelina/api build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/subscriptions/subscriptions.controller.ts apps/api/src/modules/subscriptions/subscriptions.service.ts
git commit -m "feat(subscriptions): grava consentimento (termos/privacidade + IP + versão) na ativação"
```

---

## Task 8: Checkbox de aceite no checkout

**Files:**
- Modify: `apps/web/src/app/checkout/sucesso/page.tsx:23-34,92-163,252-369`

- [ ] **Step 1: Schema + estado**

No `FormSchema` (linha 23), adicionar dentro do `.object({...})`:

```ts
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'É necessário aceitar os Termos e a Política de Privacidade.' }),
    }),
```

No `useState` do form (linha 92), adicionar `acceptedTerms: false as boolean,` ao objeto inicial.

- [ ] **Step 2: Enviar `acceptedTerms` no activate**

No `handleSubmit`, no `body` do `api('/subscriptions/activate', ...)` (linha ~150), adicionar `acceptedTerms: form.acceptedTerms,`.

- [ ] **Step 3: Checkbox no formulário**

Antes do `<button type="submit">` (linha ~347), inserir:

```tsx
              <label className="flex items-start gap-2.5 text-sm text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, acceptedTerms: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-ink-muted/40 text-brand focus:ring-brand"
                />
                <span>
                  Li e aceito os{' '}
                  <a href="/termos" target="_blank" className="text-brand underline">Termos de Uso</a>{' '}
                  e a{' '}
                  <a href="/privacidade" target="_blank" className="text-brand underline">Política de Privacidade</a>.
                </span>
              </label>
              {errors.acceptedTerms && (
                <p className="text-red-500 text-xs">{errors.acceptedTerms}</p>
              )}
```

(O `updateField` atual só lida com strings; usar `setForm` direto para o boolean, como acima. O parsing de erros em `handleSubmit` já popula `errors.acceptedTerms` a partir do `issue.path[0]`.)

- [ ] **Step 4: Build do web**

Run: `pnpm --filter @adelina/web build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/checkout/sucesso/page.tsx
git commit -m "feat(checkout): aceite obrigatório de Termos + Política de Privacidade"
```

---

## Task 9: Melhorar defaults LGPD do link de pagamento + aplicar migração + deploy

**Files:**
- Modify: `apps/api/src/common/tenant-settings.service.ts:4-13`

- [ ] **Step 1: Reescrever os textos default**

```ts
export const DEFAULT_TERMS_OF_SERVICE =
  'Ao concluir este pagamento, você confirma a reserva e declara estar de acordo com as ' +
  'políticas de hospedagem, check-in, check-out e cancelamento informadas pela pousada. ' +
  'O valor é processado de forma segura pelo Mercado Pago; a pousada não armazena os dados ' +
  'do seu cartão.';

export const DEFAULT_LGPD_CONSENT =
  'Autorizo o tratamento dos meus dados pessoais pela pousada, na condição de controladora, ' +
  'para processar este pagamento e gerir a minha reserva, conforme a Lei Geral de Proteção de ' +
  'Dados (LGPD, Lei nº 13.709/2018). Os dados não serão usados para outras finalidades sem o ' +
  'meu consentimento, e eu posso solicitar acesso, correção ou exclusão a qualquer momento ' +
  'pelos canais de atendimento da pousada.';
```

- [ ] **Step 2: Build + commit**

```bash
pnpm --filter @adelina/api build
git add apps/api/src/common/tenant-settings.service.ts
git commit -m "feat(payments): textos default de Termos e consentimento LGPD mais completos"
```

- [ ] **Step 3: Aplicar a migração no prod (SQL manual, NUNCA db push)**

Descobrir o nome dinâmico do container e aplicar em transação:

```bash
PG=$(docker ps --format '{{.Names}}' | grep adelina_postgres | head -1)
echo "container: $PG"
docker exec -i "$PG" psql -U adelina -d adelina --single-transaction <<'SQL'
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "privacy_accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consent_ip"          TEXT,
  ADD COLUMN IF NOT EXISTS "consent_doc_version" TEXT;
SQL
```

Verificar:
```bash
docker exec "$PG" psql -U adelina -d adelina -c "\d users" | grep -E "terms_accepted_at|privacy_accepted_at|consent_ip|consent_doc_version"
```
Expected: as 4 colunas listadas. **Nenhuma tabela dropada.**

- [ ] **Step 4: Deploy**

Run: `bash /root/adelina/deploy.sh 2>&1 | tee /root/adelina/deploy-legal.log`
Expected: build api+web `:latest`, `docker stack deploy`, force-update dos serviços.

- [ ] **Step 5: Verificar o rollout (pegadinha do Swarm + :latest)**

```bash
docker service ps adelina_api --no-trunc | head
docker service ps adelina_web --no-trunc | head
# confirmar que o container rodando usa a imagem recém-buildada:
docker inspect adelina-api:latest --format '{{.Id}}'
docker inspect $(docker ps -q -f name=adelina_api) --format '{{.Image}}'
```
Expected: IDs de imagem batem (rollout efetivo, não o container antigo).

- [ ] **Step 6: Smoke test em produção**

```bash
curl -s https://api.adelina.verdant.com.br/api/legal/termos | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" https://adelina.verdant.com.br/termos
curl -s -o /dev/null -w "%{http_code}\n" https://adelina.verdant.com.br/privacidade
```
Expected: JSON do documento (200) e páginas retornando 200.

- [ ] **Step 7: Commit final / nota**

Nenhum commit de código aqui além do Step 2; registrar no resumo que a migração foi aplicada e o deploy verificado.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- §1 conteúdo/tokens → Tasks 1, 2 ✅
- §2 páginas públicas + middleware + links → Task 5 ✅
- §3 dados da empresa (settings + endpoint público + UI) → Tasks 2 (endpoint via `/api/legal/:doc` rendido), 3, 4 ✅ *(endpoint serve doc rendido em vez de company-info cru — refinamento registrado no header)*
- §4 migração + checkbox + activate → Tasks 6, 7, 8 ✅
- §5 defaults LGPD → Task 9 ✅
- Critérios de aceite 1-6 → cobertos por smoke tests (Tasks 2/5/9) e gravação (Task 7).

**Placeholders:** nenhum "TBD/TODO". A conversão de conteúdo (Task 2 Step 1) tem mapa explícito e casos editoriais listados.

**Consistência de tipos:** `substituteTokens(markdown, settings)`, `LEGAL_TOKEN_KEYS`, `placeholderFor`, `LEGAL_DOC_VERSION` usados de forma idêntica nas Tasks 1, 2, 7. Campos `termsAcceptedAt/privacyAcceptedAt/consentIp/consentDocVersion` consistentes entre schema (Task 6) e service (Task 7). `acceptedTerms: z.literal(true)` igual no controller (Task 7) e no web (Task 8).
