# Despesas (Sub-projeto A do Módulo Financeiro) — Design

**Data:** 2026-06-18
**Status:** Aprovado para planejamento
**Contexto:** Primeiro sub-projeto do módulo financeiro do Adelina. O módulo financeiro
foi decomposto em três peças independentes: **A — Despesas** (este doc), **B — Proprietários
& Comissão**, **C — Fechamento mensal & Repasse** (depende de A + B). Modelo de negócio é
**misto**: algumas pousadas são donas das próprias unidades, outras administram unidades de
terceiros (proprietário é opcional por unidade).

## Objetivo

Permitir que pousadas lancem e acompanhem despesas — por propriedade ou gerais da
administradora — com controle de contas a pagar (status + vencimento). É insumo obrigatório
para o DRE (propriedades próprias) e para o repasse líquido a proprietários (propriedades
administradas), ambos no sub-projeto C.

## Decisões de escopo (travadas no brainstorming)

| Tema | Decisão |
|------|---------|
| Vínculo | Despesa pertence a UMA propriedade **ou** é geral do tenant (`propertyId` nulo). Geral NÃO entra no resultado de uma propriedade específica. Sem rateio na v1. |
| Categorias | Lista **fixa** do sistema (enum). Sem categorias customizáveis. |
| Recorrência | Apenas **lançamento avulso**. Sem geração automática nem "duplicar". |
| Contas a pagar | Despesa tem status `pending`/`paid`, `dueDate` (vencimento) e `paidAt` (data do pagamento). |
| Comprovante | Apenas **campo de URL** (link do Drive/foto). Sem upload nem storage. |
| Visualização | Dado financeiro é sensível: ler e escrever restrito a **owner + manager**. Recepcionista/governança/readonly não veem o menu Financeiro. |

## Fora de escopo (YAGNI / sub-projetos seguintes)

- Recorrência automática de despesas (scheduler).
- Upload de arquivo / storage de comprovantes.
- Rateio de despesa geral entre propriedades (será tratado no C, se necessário).
- Fornecedor como entidade própria (na v1 é texto livre).

## Modelo de dados

Nova tabela `expenses` com Row Level Security por tenant, no mesmo padrão das demais
tabelas do prod.

```prisma
enum ExpenseCategory {
  utilities_water    // água
  utilities_power    // energia
  utilities_internet // internet/telefonia
  cleaning           // limpeza
  maintenance        // manutenção/reparos
  salaries           // salários/pessoal
  taxes              // impostos/taxas
  supplies           // suprimentos/insumos
  marketing          // marketing/publicidade
  software           // sistemas/assinaturas
  rent               // aluguel
  other              // outros
}

enum ExpenseStatus {
  pending // a pagar
  paid    // pago
}

model Expense {
  id          String          @id @default(uuid()) @db.Uuid
  tenantId    String          @map("tenant_id") @db.Uuid
  propertyId  String?         @map("property_id") @db.Uuid // null = despesa geral do tenant
  category    ExpenseCategory
  description String
  supplier    String?         // fornecedor (texto livre)
  amount      Decimal         @db.Decimal(10, 2)
  status      ExpenseStatus   @default(pending)
  dueDate     DateTime?       @map("due_date") @db.Date
  paidAt      DateTime?       @map("paid_at") @db.Date
  receiptUrl  String?         @map("receipt_url") // link do comprovante
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  property Property? @relation(fields: [propertyId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([propertyId])
  @@index([status])
  @@index([dueDate])
  @@map("expenses")
}
```

Adiciona-se a relação inversa `expenses Expense[]` em `Tenant` e em `Property`.

### Migração (CRÍTICO — gotcha do prod)

`prisma db push` em prod tenta DROPAR quase todas as tabelas (divergência de histórico
RLS/SQL manual) — **NUNCA usar `db push` neste prod**. O schema novo é aplicado via:

1. Migration file aditivo em `packages/db/prisma/migrations/<timestamp>_expenses/`.
2. SQL aplicado em prod manualmente dentro de transação:
   `docker exec adelina_postgres psql ... --single-transaction`.
3. RLS no mesmo padrão das outras tabelas:
   ```sql
   ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
   CREATE POLICY expenses_tenant ON expenses
     USING (tenant_id = app_current_tenant());
   ```
4. Criar os ENUMs `ExpenseCategory` e `ExpenseStatus` (PascalCase-safe; o prod já usa
   nomes de tipo em PascalCase para enums).

## API

Novo módulo `apps/api/src/modules/expenses` espelhando o padrão dos módulos existentes
(controller + service + DTOs), registrado no `AppModule`.

| Método | Rota | Capacidade | Descrição |
|--------|------|-----------|-----------|
| POST | `/api/expenses` | `expense:manage` | Cria despesa |
| GET | `/api/expenses` | `expense:read` | Lista com filtros: `propertyId`, `category`, `status`, `from`, `to` |
| GET | `/api/expenses/summary` | `expense:read` | Totais: total, pago, a pagar, por categoria, no período |
| GET | `/api/expenses/:id` | `expense:read` | Detalhe |
| PATCH | `/api/expenses/:id` | `expense:manage` | Edita (inclui marcar como pago) |
| DELETE | `/api/expenses/:id` | `expense:manage` | Remove |

- Todos os endpoints são tenant-scoped via guard de auth + RLS.
- Validação: `amount > 0`; `category` no enum; se `status=paid` e `paidAt` ausente, default
  para hoje; `propertyId`, quando informado, deve pertencer ao tenant.

### RBAC

Duas novas capacidades na matriz central (`apps/api/src/common/permissions.ts`):

- `expense:read` → owner, manager
- `expense:manage` → owner, manager

Endpoints anotados com `@RequireCapability(...)` (CapabilityGuard já registrado). Espelho
idêntico em `apps/web/src/lib/permissions.ts` para esconder a UI. **Regra de ouro: ao mudar
a matriz, atualizar os DOIS espelhos (api + web).**

## UI

Nova seção **Financeiro → Despesas** no app web, visível no menu apenas para owner+manager
(via `useCan('expense:read')`).

- **Lista:** tabela com data, propriedade (ou "Geral"), categoria, descrição, fornecedor,
  valor, status (badge), vencimento. Despesas vencidas (status `pending` + `dueDate` passado)
  em destaque.
- **Filtros:** propriedade, categoria, status, intervalo de datas.
- **Resumo (cards):** total no período, total pago, total a pagar.
- **Criar/editar:** modal com propriedade (incl. opção "Geral do tenant"), categoria,
  descrição, fornecedor, valor, status, vencimento, data de pagamento, URL do comprovante.
- **Ação rápida:** marcar como pago (define `status=paid` + `paidAt=hoje`).
- Padrões da UI existente: `toast` do `sonner` (2º arg = `{description}`); gating com `useCan`.

## Testes

- API: unit/e2e do `ExpensesService` — criação, filtros, summary (somatórios por
  status/categoria/período), isolamento por tenant (RLS), validação de `propertyId` do tenant,
  enforcement de capacidade por papel.
- Build usa SWC (transpile-only); erros pré-existentes de `tsc` não bloqueiam build.

## Dependências e relação com os próximos sub-projetos

- **C — Fechamento & Repasse** consumirá `GET /api/expenses/summary` (por propriedade e
  período) para compor receita − despesa − comissão = resultado. A modelagem de despesa geral
  (sem propriedade) deixa a porta aberta para rateio opcional no C sem mudança de schema.
