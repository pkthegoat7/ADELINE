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

  it('escapa & antes de < e > para evitar dupla-escape', () => {
    const out = substituteTokens('{{razaoSocial}}', { legal_company_name: 'A & B <Ltd>' });
    expect(out).toBe('A &amp; B &lt;Ltd&gt;');
  });

  it('substitui todas as ocorrências do mesmo token', () => {
    const out = substituteTokens('{{cnpj}} / {{cnpj}}', { legal_cnpj: '00.000.000/0001-00' });
    expect(out).toBe('00.000.000/0001-00 / 00.000.000/0001-00');
  });

  it('mantém texto sem tokens intacto', () => {
    expect(substituteTokens('Sem tokens aqui.', {})).toBe('Sem tokens aqui.');
  });

  it('mapeia todos os 9 tokens esperados para chaves de setting', () => {
    const keys = Object.keys(LEGAL_TOKEN_KEYS);
    expect(keys).toHaveLength(9);
    expect(LEGAL_TOKEN_KEYS.razaoSocial).toBe('legal_company_name');
    expect(LEGAL_TOKEN_KEYS.emailDpo).toBe('legal_dpo_email');
  });
});
