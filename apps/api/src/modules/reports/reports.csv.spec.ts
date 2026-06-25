import { describe, expect, it } from 'vitest';
import { toCsv } from './reports.csv';

describe('toCsv', () => {
  it('monta cabeçalho + linhas', () => {
    const csv = toCsv(['data', 'valor'], [['2026-06-01', 100], ['2026-06-02', 50]]);
    expect(csv).toBe('data,valor\n2026-06-01,100\n2026-06-02,50');
  });

  it('escapa vírgula, aspas e quebra de linha', () => {
    const csv = toCsv(['desc'], [['a,b'], ['diz "oi"'], ['linha\nquebra']]);
    expect(csv).toBe('desc\n"a,b"\n"diz ""oi"""\n"linha\nquebra"');
  });

  it('campos vazios/nulos viram string vazia', () => {
    const csv = toCsv(['a', 'b'], [[null as unknown as string, '']]);
    expect(csv).toBe('a,b\n,');
  });

  it('neutraliza injeção de fórmula em strings (=,+,-,@) com apóstrofo', () => {
    const csv = toCsv(
      ['nome'],
      [['=HYPERLINK("http://x")'], ['+1'], ['-cmd'], ['@SUM(A1)'], ['João']],
    );
    expect(csv).toBe(
      'nome\n"\'=HYPERLINK(""http://x"")"\n\'+1\n\'-cmd\n\'@SUM(A1)\nJoão',
    );
  });

  it('NÃO prefixa números negativos (saldo -10 fica intacto)', () => {
    const csv = toCsv(['dia', 'saldo'], [['2026-06-01', -10]]);
    expect(csv).toBe('dia,saldo\n2026-06-01,-10');
  });
});
