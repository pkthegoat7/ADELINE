/** Versão atual dos documentos legais; gravada no consentimento do usuário. */
export const LEGAL_DOC_VERSION = '1.0';

/** token de template (no markdown) → chave em system_settings. */
export const LEGAL_TOKEN_KEYS = {
  razaoSocial: 'legal_company_name',
  cnpj: 'legal_cnpj',
  endereco: 'legal_address',
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
