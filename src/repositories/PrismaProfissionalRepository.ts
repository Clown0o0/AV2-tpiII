import type { Prisma, PrismaClient } from '@prisma/client';
import { Avaliacao } from '../domain/entities/Avaliacao';
import { Competencia } from '../domain/entities/Competencia';
import { Profissional } from '../domain/entities/Profissional';
import type { ProfissionalRepository } from '../domain/ports/ProfissionalRepository';

const INCLUDE_PROFISSIONAL = {
  competencias: true,
  avaliacoes: true,
  disponibilidades: true,
} satisfies Prisma.ProfissionalInclude;

const TAMANHO_PAGINA = 1000;

export type ProfissionalPersistido = Prisma.ProfissionalGetPayload<{ include: typeof INCLUDE_PROFISSIONAL }>;

export class PrismaProfissionalRepository implements ProfissionalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Lê o cadastro em páginas por id; entre uma página e outra o event loop atende outras requisições.
  async listarTodos(): Promise<Profissional[]> {
    const profissionais: Profissional[] = [];
    let cursor: string | undefined;
    for (;;) {
      const pagina = await this.lerPagina(cursor);
      for (const registro of pagina) profissionais.push(paraDominio(registro));
      const ultimo = pagina.at(-1);
      if (pagina.length < TAMANHO_PAGINA || !ultimo) return profissionais;
      cursor = ultimo.id;
    }
  }

  private lerPagina(depoisDoId: string | undefined): Promise<ProfissionalPersistido[]> {
    return this.prisma.profissional.findMany({
      take: TAMANHO_PAGINA,
      orderBy: { id: 'asc' },
      ...(depoisDoId ? { cursor: { id: depoisDoId }, skip: 1 } : {}),
      include: INCLUDE_PROFISSIONAL,
    });
  }

  async buscarPorIds(ids: readonly string[]): Promise<Profissional[]> {
    if (ids.length === 0) return [];
    const registros = await this.prisma.profissional.findMany({
      where: { id: { in: [...ids] } },
      include: INCLUDE_PROFISSIONAL,
    });
    return registros.map(paraDominio);
  }
}

export function paraDominio(registro: ProfissionalPersistido): Profissional {
  return new Profissional({
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    especialidades: registro.especialidades,
    precoMin: Number(registro.precoMin),
    precoMax: Number(registro.precoMax),
    localizacao: registro.localizacao,
    historicoProjetos: registro.historicoProjetos,
    disponibilidade: registro.disponibilidades.map((d) => ({ inicio: d.inicio, fim: d.fim })),
    competencias: registro.competencias.map((c) => new Competencia(c.nome, c.nivel)),
    avaliacoes: registro.avaliacoes.map((avaliacao) => new Avaliacao(avaliacao)),
  });
}
