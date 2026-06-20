# Design — Wiring de Termos de Uso + Política de Privacidade (LGPD)

**Data:** 2026-06-20
**Status:** aprovado para planejamento
**Contexto:** as minutas legais já existem (`docs/legal/{termos-de-uso,politica-de-privacidade}.md`, commit `c0ba1af`). Falta o wiring: páginas públicas, aceite obrigatório no checkout com gravação de consentimento, e dados da empresa editáveis. Continuação do item "em andamento" do módulo Adelina.

---

## Objetivo

Colocar os documentos legais no ar e capturar consentimento juridicamente rastreável dos novos assinantes (owners), conforme LGPD (Lei 13.709/2018), Marco Civil (Lei 12.965/2014) e CDC (Lei 8.078/1990).

## Decisão de arquitetura

**Corpo dos documentos no repositório (markdown versionado) + dados da empresa em `system_settings` (editáveis no super-admin), substituídos na renderização.**

- O texto legal deve ficar em git: rastro de auditoria, revisão jurídica via commit, e evolução controlada da minuta.
- Apenas os identificadores da empresa (razão social, CNPJ, endereço, DPO, foro, prazos) mudam dinamicamente e são editados pelo super-admin sem deploy.

Alternativa rejeitada: armazenar o texto inteiro no banco e editar tudo pelo painel — perde versionamento/auditoria do texto legal e mistura conteúdo jurídico com configuração operacional.

---

## Componentes

### 1. Conteúdo legal (template tokens)

Mover as minutas para `apps/web/src/content/legal/{termos,privacidade}.md` como **fonte canônica**. Substituir os marcadores `[COLCHETES]` por tokens de template explícitos:

| Token | Origem (`system_settings` key) | Placeholder ao vazio |
|---|---|---|
| `{{razaoSocial}}` | `legal_company_name` | `〔razão social a preencher〕` |
| `{{cnpj}}` | `legal_cnpj` | `〔CNPJ a preencher〕` |
| `{{endereco}}` | `legal_address` | `〔endereço a preencher〕` |
| `{{cidadeUf}}` | `legal_city_state` | `〔cidade/UF a preencher〕` |
| `{{emailSuporte}}` | `legal_support_email` | `〔e-mail de suporte a preencher〕` |
| `{{nomeDpo}}` | `legal_dpo_name` | `〔encarregado a preencher〕` |
| `{{emailDpo}}` | `legal_dpo_email` | `〔e-mail do encarregado a preencher〕` |
| `{{foro}}` | `legal_jurisdiction` | `〔foro a preencher〕` |
| `{{prazoRetencao}}` | `legal_data_retention` | `〔prazo a preencher〕` |
| `{{provedorNuvem}}` | `legal_cloud_provider` | `〔provedor de nuvem a preencher〕` |

Regras:
- Tokens sem valor preenchido renderizam o placeholder visível — **nunca** quebram a página nem exibem o token cru.
- O cabeçalho "minuta-modelo / revisar por advogado" das minutas atuais é removido do conteúdo renderizado ao público (vira comentário no topo do arquivo, fora do corpo).
- As cópias em `docs/legal/*.md` deixam de ser canônicas; um aviso no topo aponta para `apps/web/src/content/legal/`.

### 2. Páginas públicas `/termos` e `/privacidade`

- **Server Components** (`apps/web/src/app/termos/page.tsx`, `.../privacidade/page.tsx`).
- Fluxo: importam o markdown canônico → buscam dados da empresa via `GET /api/legal/company-info` → substituem tokens → renderizam markdown→HTML com biblioteca leve (`marked`) + sanitização (`isomorphic-dompurify` ou equivalente já presente; se não houver, `marked` com escaping padrão e sem HTML inline nas minutas).
- Layout: container de leitura (prosa), tipografia da marca, cabeçalho com logo + link de volta, rodapé com data/versão.
- Adicionadas ao allowlist de rotas públicas do `apps/web/src/middleware.ts` (`/termos`, `/privacidade`).
- Links adicionados no rodapé: landing (`page.tsx`), página de login e `/checkout/sucesso`.

### 3. Dados da empresa no super-admin

- Novas chaves em `system_settings` (lista da seção 1): `legal_company_name`, `legal_cnpj`, `legal_address`, `legal_city_state`, `legal_support_email`, `legal_dpo_name`, `legal_dpo_email`, `legal_jurisdiction`, `legal_data_retention`, `legal_cloud_provider`.
- Adicionadas ao `AdminController.ALLOWED_SETTINGS` com validação leve (e-mails válidos para os campos de e-mail; tamanho máximo razoável para texto). Marcáveis como `DELETABLE_SETTINGS` (limpar volta ao placeholder). Não mascaradas.
- **Endpoint público** `GET /api/legal/company-info` (`@Public()`): retorna só os campos `legal_*` (chave→valor, sem máscara) para as páginas legais. Sem dados sensíveis (não expõe tokens MP).
- UI: nova seção "Dados da empresa (documentos legais)" em `apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx`, seguindo o padrão de campos já existente (mesma mecânica de `PUT /api/admin/settings`).

### 4. Aceite obrigatório no checkout → consentimento no `User`

**Schema (migração aditiva, tabela `users`):**
- `terms_accepted_at TIMESTAMP NULL`
- `privacy_accepted_at TIMESTAMP NULL`
- `consent_ip TEXT NULL`
- `consent_doc_version TEXT NULL`

Adicionar os campos correspondentes ao model `User` no `schema.prisma` (camelCase + `@map`). Migration file aditiva em `packages/db/prisma/migrations/`. **Aplicar em prod via SQL manual `--single-transaction` no container `adelina_postgres` (`psql -U adelina -d adelina`) — NUNCA `prisma db push`** (pegadinha conhecida: db push quer dropar tabelas por divergência de histórico RLS). Colunas nullable, sem mudança de policy RLS.

**Frontend (`/checkout/sucesso`):**
- Checkbox obrigatório: "Li e aceito os **Termos de Uso** e a **Política de Privacidade**", com os dois termos como links que abrem `/termos` e `/privacidade` (nova aba).
- `FormSchema` (Zod) ganha `acceptedTerms: z.literal(true)` com mensagem "É necessário aceitar os Termos e a Política de Privacidade.".
- Submit bloqueado enquanto desmarcado.

**Backend (`activate()` em `subscriptions.service.ts` + controller):**
- Input ganha `acceptedTerms: boolean`. Valida server-side: se `!== true` → `BadRequestException`.
- Controller lê o IP do request (Fastify `request.ip`) e repassa ao service.
- Constante `LEGAL_DOC_VERSION = '1.0'` (no módulo de subscriptions ou em local compartilhado com o conteúdo legal).
- Dentro da transação de criação do user, gravar `termsAcceptedAt = now`, `privacyAcceptedAt = now`, `consentIp = <ip>`, `consentDocVersion = LEGAL_DOC_VERSION`.

### 5. Melhorar defaults LGPD do link de pagamento

Reescrever `DEFAULT_TERMS_OF_SERVICE` e `DEFAULT_LGPD_CONSENT` em `apps/api/src/common/tenant-settings.service.ts` com texto mais completo: identificação da pousada como controladora dos dados, finalidade (processamento do pagamento e gestão da reserva), base legal, direitos do titular e referência expressa à LGPD. Apenas melhoria de texto — sem mudança de mecânica do fluxo de pagamento.

---

## Fora de escopo (YAGNI)

- Portal/login do proprietário.
- Versionamento histórico de consentimento (basta a versão corrente em `consent_doc_version`).
- Re-aceite de usuários já existentes (somente novos assinantes via checkout passam pelo aceite).
- Aceite no `/cadastro` direto — o fluxo real de criação de owner é o checkout pós-pagamento (decisão confirmada com o dono).
- Edição do corpo do texto legal pelo painel (fica em git).

---

## Critérios de aceite

1. `/termos` e `/privacidade` acessíveis sem login, renderizando o texto com os dados da empresa substituídos (ou placeholders visíveis se vazios).
2. Super-admin consegue editar os 10 campos `legal_*` em `/admin/configuracoes` e a mudança reflete nas páginas públicas.
3. Checkout não conclui sem o checkbox marcado; tentativa de `activate` com `acceptedTerms=false` é rejeitada com 400.
4. Após ativação bem-sucedida, o `User` owner tem `terms_accepted_at`, `privacy_accepted_at`, `consent_ip` e `consent_doc_version` preenchidos.
5. Migração aplicada em prod sem dropar nenhuma tabela (verificado: SQL aditivo em transação).
6. Defaults LGPD do link de pagamento exibem o texto melhorado em pousadas que não customizaram.

## Riscos / pegadinhas

- **`prisma db push` em prod = perda de dados.** Migração SÓ via SQL aditivo manual em transação.
- **`isSuperAdmin` não tem bypass de CapabilityGuard**, mas o endpoint de settings usa `assertSuperAdmin` próprio — manter esse guard no novo endpoint de escrita; o `GET /api/legal/company-info` é `@Public()` de leitura apenas dos campos legais.
- **Sanitização do markdown** — as minutas são texto puro (sem HTML inline); manter renderização sem `dangerouslySetInnerHTML` de fonte não confiável. O conteúdo é do repo (confiável), os valores substituídos vêm do super-admin (confiável, mas escapar mesmo assim).
- **SWC transpile-only no build** ignora erros de tsc pré-existentes não relacionados — não confundir com erro novo.
