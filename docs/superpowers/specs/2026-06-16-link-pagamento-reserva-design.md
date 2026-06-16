# Link de Pagamento da Reserva — Design

**Data:** 2026-06-16
**Status:** Aprovado pelo dono

## Objetivo

Permitir que a pousada gere um **link de pagamento referente a uma reserva** e envie ao hóspede. O hóspede abre uma página pública com o resumo da reserva (check-in/out e demais informações de costume), **aceita os Termos de Uso e Serviço e o termo de LGPD**, e paga via Mercado Pago (Pix ou cartão). É um pagamento único do hóspede — distinto da assinatura do SaaS (que usa PreApproval).

## Decisões de escopo (definidas com o dono)

- **Valor:** a pousada digita o valor a cobrar (sinal, parcial ou total). Validado `> 0`. O total da reserva é exibido como referência, sem travar.
- **Envio:** configurável. A pousada pode disparar automaticamente pelo WhatsApp (integração Evolution já existe) e/ou copiar uma **mensagem pronta** (com o link) para enviar manualmente.
- **Termos (Uso/Serviço + LGPD):** textos **configuráveis por pousada**, com um padrão pronto. O aceite é obrigatório antes do checkout e é registrado para fins legais.
- **Gateway:** Mercado Pago **Checkout Pro** (Preference), reusando o `mp_access_token` já armazenado em `system_settings`.

## Arquitetura

Novo módulo `payments` na API, espelhando o padrão público-com-token já consolidado em `guest-links` (token aleatório, `@Public()`, TTL, `publicWebUrl`, throttle). Página pública no web espelhando `/cadastro/[token]`. O Mercado Pago é integrado via `Preference` para cobrança única.

Separação de responsabilidades:
- **`PaymentLink`** = a cobrança/intenção de pagamento (token público, valor, consentimento, status).
- **`Payment`** (modelo já existente) = o dinheiro liquidado, criado quando o MP confirma.

## Modelo de dados (Prisma)

### Novo model `PaymentLink`
```
id                 String   @id @default(uuid()) @db.Uuid
tenantId           String   @map("tenant_id") @db.Uuid
reservationId      String   @map("reservation_id") @db.Uuid
token              String   @unique
amount             Decimal  @db.Decimal(10, 2)
description        String?
status             PaymentLinkStatus @default(pending)   // pending | paid | expired | cancelled
mpPreferenceId     String?  @map("mp_preference_id")
mpPaymentId        String?  @map("mp_payment_id")
termsAcceptedAt    DateTime? @map("terms_accepted_at")
lgpdAcceptedAt     DateTime? @map("lgpd_accepted_at")
acceptedIp         String?  @map("accepted_ip")
termsSnapshot      String?  @db.Text @map("terms_snapshot")  // texto exato no aceite (prova)
expiresAt          DateTime @map("expires_at")
paidAt             DateTime? @map("paid_at")
createdAt          DateTime @default(now()) @map("created_at")
updatedAt          DateTime @updatedAt @map("updated_at")

tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
reservation Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)

@@index([tenantId])
@@index([reservationId])
@@map("payment_links")
```
Novo enum `PaymentLinkStatus { pending paid expired cancelled }`. Relação inversa `paymentLinks PaymentLink[]` em `Reservation` e `Tenant`.

### Novo model `TenantSetting` (config key-value por pousada)
Espelho do `SystemSetting` global, mas escopado por tenant.
```
id        String  @id @default(uuid()) @db.Uuid
tenantId  String  @map("tenant_id") @db.Uuid
key       String
value     String  @db.Text
updatedAt DateTime @updatedAt @map("updated_at")

tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

@@unique([tenantId, key])
@@map("tenant_settings")
```
Chaves usadas: `payment_terms_of_service`, `payment_lgpd_consent`, `payment_link_auto_whatsapp` (`'true'`/`'false'`). Lidas com fallback para textos-padrão embutidos no código.

### MessageTemplate
Adicionar o tipo `payment_link` ao enum `MessageTemplateType` — corpo padrão da mensagem pronta (com placeholder do link e dados da reserva).

> **Nota de migração:** modelos anteriores (`subscriptions`, `system_settings`) foram aplicados em prod via `prisma db push` sem arquivos de migration. Estes novos modelos devem ser tratados do mesmo jeito em prod (push) OU resolver a divergência de histórico — decidir no plano de implementação.

## Componentes — Backend (`apps/api/src/modules/payments`)

- `POST /reservations/:id/payment-links` (autenticado, tenant-scoped via `withTenant`)
  - Body: `{ amount: number > 0, description?: string, sendWhatsapp?: boolean }`.
  - Cria `PaymentLink` (token aleatório, `expiresAt = now + 7 dias`).
  - Monta a mensagem pronta a partir do `MessageTemplate` tipo `payment_link` (com link + resumo).
  - Se `sendWhatsapp` (ou o default `payment_link_auto_whatsapp`) → dispara `whatsapp.sendText(tenantId, guestPhone, message)`.
  - Retorna `{ url, message, paymentLinkId }`.
- `GET /pay/:token` (`@Public()`)
  - Retorna resumo público: nome da pousada, nome do hóspede, check-in/out, nº de noites, quarto(s), valor, descrição, status do link + os textos `payment_terms_of_service` e `payment_lgpd_consent` da pousada. Sem dados sensíveis além do necessário.
  - Se expirado/pago/cancelado → status correspondente para a UI tratar.
- `POST /pay/:token/checkout` (`@Public()`, throttle estrito)
  - Body: `{ acceptTerms: true, acceptLgpd: true }`. Rejeita (400) se algum aceite faltar.
  - Grava `termsAcceptedAt`, `lgpdAcceptedAt`, `acceptedIp` (do request), `termsSnapshot` (concatenação dos dois textos exibidos).
  - Cria a Preference no MP (`back_urls`, `notification_url`, item com `title`=descrição/pousada e `unit_price`=amount), salva `mpPreferenceId`, retorna `{ initPoint }`.
- `POST /pay/webhook` (`@Public()`)
  - Ao receber pagamento aprovado: salva `mpPaymentId`, marca `PaymentLink.status = paid` + `paidAt`, cria `Payment` (method `link`, gateway `mercadopago`, status `paid`), e atualiza `Reservation.paymentStatus` (`paid` se soma dos pagamentos ≥ `totalAmount`, senão `partial`). Idempotente por `mpPaymentId`.

## Componentes — Frontend

- **Página pública `/pagamento/[token]`** (espelha `/cadastro/[token]`):
  - Card com resumo: pousada, hóspede, check-in/out (datas + nº noites), quarto, valor em destaque, descrição.
  - **Dois checkboxes** obrigatórios: "Li e aceito os Termos de Uso e Serviço" e "Concordo com o tratamento dos meus dados conforme a LGPD" — cada um com link/expansão para ler o texto completo.
  - Botão "Pagar agora" desabilitado até os dois marcados → chama `/pay/:token/checkout` → redireciona ao `initPoint` do MP.
  - Estados: expirado / já pago / cancelado mostram mensagem amigável (sem botão de pagar).
- **Dashboard — na reserva:** ação "Gerar link de pagamento" abre modal com: valor (com o total da reserva exibido como referência), descrição opcional, toggle "enviar por WhatsApp". Após gerar: mostra o link e a **mensagem pronta com botão copiar**.
- **Configurações (por pousada):** seção "Pagamentos" para editar os textos de Termos de Uso/Serviço e LGPD e o toggle de envio automático padrão.

## Tratamento de erros

- Aceites não marcados → 400 com mensagem clara.
- Link expirado/pago/cancelado → página pública mostra estado, sem permitir novo pagamento.
- `mp_access_token` ausente → erro claro pedindo configuração ao admin.
- Webhook duplicado → idempotência por `mpPaymentId` (não cria Payment duplicado).
- Reserva cancelada → não permitir gerar link (validação no POST).

## Testes / Verificação

- Typecheck `@adelina/api` e `@adelina/web` limpos.
- Manual: gerar link numa reserva → abrir `/pagamento/:token` → tentar pagar sem aceitar (bloqueado) → aceitar e pagar (sandbox MP) → confirmar `Payment` criado, `PaymentLink.paid` e `Reservation.paymentStatus` atualizado.
- Manual: editar textos de termos nas configurações e confirmar que aparecem na página pública.
- Manual: toggle WhatsApp on/off e mensagem pronta copiável.

## Fora de escopo (YAGNI)

- Reembolso/estorno pela UI (feito direto no painel do MP por ora).
- Parcelamento configurável (usa o default do Checkout Pro).
- Múltiplas moedas (sempre BRL).
- Comprovante/recibo em PDF.
