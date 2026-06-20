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
