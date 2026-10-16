import type { Prisma, PrismaClient } from '@prisma/client';
import { Convite } from '../domain/entities/Convite';
import type { VetorCompetencias } from '../domain/entities/Competencia';
import type { DadosProjeto, DetalhesProjeto, PapelRequerido, Projeto } from '../domain/entities/Projeto';
import {
  MembroRecomendado,
  Recomendacao,
  type Alternativa,
  type MembroRecomendadoLeitura,
  type StatusRecomendacao,
} from '../domain/entities/Recomendacao';
import type { ConviteRepository } from '../domain/ports/ConviteRepository';
import type { ProjetoRepository } from '../domain/ports/ProjetoRepository';
import type { RecomendacaoRepository } from '../domain/ports/RecomendacaoRepository';
import type { CatalogoFabricas } from '../factories/FabricaProjeto';

type ProjetoPersistido = Prisma.ProjetoGetPayload<{ include: { papeis: true } }>;
type RecomendacaoPersistida = Prisma.RecomendacaoGetPayload<{ include: { membros: true } }>;
type MembroPersistido = RecomendacaoPersistida['membros'][number];
type ConvitePersistido = Prisma.ConviteGetPayload<object>;
type PapelPersistido = ProjetoPersistido['papeis'][number];

type CamposObrigatoriosDoProjeto = Omit<DadosProjeto, 'id' | 'criadoEm' | 'papeis' | 'detalhes'>;

type CamposDoProjeto = Required<CamposObrigatoriosDoProjeto> & { detalhes: Prisma.InputJsonObject | undefined };

interface CamposDaRecomendacao {
  status: StatusRecomendacao;
  parcial: boolean;
  avisos: string[];
  rodadas: number;
  finalizadaEm: Date | null;
}

// As chaves são colunas uuid: o Postgres rejeita a consulta com outro formato, e um id assim
// simplesmente não existe.
function ehUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export class PrismaProjetoRepository implements ProjetoRepository, RecomendacaoRepository, ConviteRepository {
  constructor(
    private readonly prisma: PrismaClient,
    // Reconstrói o subtipo certo (documentário, animação...) a partir do tipoCaptacao gravado.
    private readonly fabricas: CatalogoFabricas,
  ) {}

  async salvar(projeto: Projeto): Promise<void> {
    const campos = camposDoProjeto(projeto);
    await this.prisma.$transaction(async (tx) => {
      await tx.projeto.upsert({
        where: { id: projeto.id },
        create: { id: projeto.id, criadoEm: projeto.criadoEm, ...campos },
        update: campos,
      });
      await tx.projetoPapel.deleteMany({ where: { projetoId: projeto.id } });
      await tx.projetoPapel.createMany({ data: projeto.papeis.map((papel) => papelParaGravar(projeto.id, papel)) });
    });
  }

  async buscarPorId(id: string): Promise<Projeto | null> {
    if (!ehUuid(id)) return null;
    const registro = await this.prisma.projeto.findUnique({ where: { id }, include: { papeis: true } });
    return registro ? projetoParaDominio(registro, this.fabricas) : null;
  }

  async salvarRecomendacao(recomendacao: Recomendacao): Promise<void> {
    const campos = camposDaRecomendacao(recomendacao);
    await this.prisma.$transaction(async (tx) => {
      await tx.recomendacao.upsert({
        where: { id: recomendacao.id },
        create: { ...campos, id: recomendacao.id, projetoId: recomendacao.projetoId, estrategia: recomendacao.estrategia, criadaEm: recomendacao.criadaEm },
        update: campos,
      });
      await tx.membroRecomendado.deleteMany({ where: { recomendacaoId: recomendacao.id } });
      await tx.membroRecomendado.createMany({ data: recomendacao.membros.map((membro) => membroParaGravar(recomendacao.id, membro)) });
    });
  }

  async buscarRecomendacao(id: string): Promise<Recomendacao | null> {
    if (!ehUuid(id)) return null;
    const registro = await this.prisma.recomendacao.findUnique({ where: { id }, include: { membros: true } });
    return registro ? recomendacaoParaDominio(registro) : null;
  }

  async buscarRecomendacaoVigente(projetoId: string): Promise<Recomendacao | null> {
    const registro = await this.prisma.recomendacao.findFirst({
      where: { projetoId, status: { not: 'OBSOLETA' } },
      orderBy: { criadaEm: 'desc' },
      include: { membros: true },
    });
    return registro ? recomendacaoParaDominio(registro) : null;
  }

  async salvarConvite(convite: Convite): Promise<void> {
    const campos = { status: convite.status, respondidoEm: convite.respondidoEm };
    await this.prisma.convite.upsert({
      where: { id: convite.id },
      create: {
        id: convite.id,
        recomendacaoId: convite.recomendacaoId,
        projetoId: convite.projetoId,
        profissionalId: convite.profissionalId,
        papel: convite.papel,
        criadoEm: convite.criadoEm,
        ...campos,
      },
      update: campos,
    });
  }

  async buscarConvite(id: string): Promise<Convite | null> {
    if (!ehUuid(id)) return null;
    const registro = await this.prisma.convite.findUnique({ where: { id } });
    return registro ? conviteParaDominio(registro) : null;
  }

  async listarConvites(recomendacaoId: string): Promise<Convite[]> {
    const registros = await this.prisma.convite.findMany({ where: { recomendacaoId }, orderBy: { criadoEm: 'asc' } });
    return registros.map(conviteParaDominio);
  }
}

function camposDoProjeto(projeto: Projeto): CamposDoProjeto {
  return {
    titulo: projeto.titulo,
    produtorId: projeto.produtorId,
    produtorEmail: projeto.produtorEmail,
    genero: projeto.genero,
    duracaoEstimadaMin: projeto.duracaoEstimadaMin,
    orcamentoTotal: projeto.orcamentoTotal,
    dataEntrega: projeto.dataEntrega,
    tipoCaptacao: projeto.tipoCaptacao,
    localizacao: projeto.localizacao,
    estrategia: projeto.estrategia,
    detalhes: projeto.detalhes ? detalhesComoJson(projeto.detalhes) : undefined,
  };
}

// Fronteira com o Prisma: os detalhes já foram validados pelo subtipo do projeto e são JSON puro.
function detalhesComoJson(detalhes: DetalhesProjeto): Prisma.InputJsonObject {
  return detalhes as Prisma.InputJsonObject;
}

function papelParaGravar(projetoId: string, papel: PapelRequerido): Prisma.ProjetoPapelCreateManyInput {
  return { projetoId, papel: papel.papel, peso: papel.peso, competenciasDesejadas: papel.competenciasDesejadas };
}

function camposDaRecomendacao(recomendacao: Recomendacao): CamposDaRecomendacao {
  return {
    status: recomendacao.status,
    parcial: recomendacao.parcial,
    avisos: [...recomendacao.avisos],
    rodadas: recomendacao.rodadas,
    finalizadaEm: recomendacao.finalizadaEm,
  };
}

function membroParaGravar(recomendacaoId: string, membro: MembroRecomendadoLeitura): Prisma.MembroRecomendadoCreateManyInput {
  return {
    id: membro.id,
    recomendacaoId,
    papel: membro.papel,
    profissionalId: membro.profissionalId,
    score: membro.score,
    custo: membro.custo,
    status: membro.status,
    rodada: membro.rodada,
    alternativas: membro.alternativas.map((a) => ({ ...a })),
  };
}

export function projetoParaDominio(registro: ProjetoPersistido, fabricas: CatalogoFabricas): Projeto {
  const { papeis, detalhes, orcamentoTotal, ...campos } = registro;
  return fabricas.obter(registro.tipoCaptacao).criarProjeto({
    ...campos,
    orcamentoTotal: Number(orcamentoTotal),
    detalhes: ehObjetoJson(detalhes) ? detalhes : null,
    papeis: papeis.map(papelParaDominio),
  });
}

function papelParaDominio(registro: PapelPersistido): PapelRequerido {
  const { papel, peso, competenciasDesejadas } = registro;
  return ehVetorDeNiveis(competenciasDesejadas) ? { papel, peso, competenciasDesejadas } : { papel, peso };
}

export function recomendacaoParaDominio(registro: RecomendacaoPersistida): Recomendacao {
  const { membros, ...campos } = registro;
  return new Recomendacao({ ...campos, membros: membros.map(membroParaDominio) });
}

function membroParaDominio(registro: MembroPersistido): MembroRecomendado {
  const { recomendacaoId: _recomendacaoId, custo, alternativas, ...campos } = registro;
  return new MembroRecomendado({ ...campos, custo: Number(custo), alternativas: ehListaDeAlternativas(alternativas) ? alternativas : [] });
}

export function conviteParaDominio(registro: ConvitePersistido): Convite {
  return new Convite(registro);
}

function ehObjetoJson(valor: Prisma.JsonValue): valor is Prisma.JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function ehVetorDeNiveis(valor: Prisma.JsonValue): valor is Prisma.JsonObject & VetorCompetencias {
  return ehObjetoJson(valor) && Object.values(valor).every((nivel) => typeof nivel === 'number');
}

function ehListaDeAlternativas(valor: Prisma.JsonValue): valor is Array<Prisma.JsonObject & Alternativa> {
  return Array.isArray(valor) && valor.every(ehAlternativa);
}

function ehAlternativa(valor: Prisma.JsonValue): boolean {
  return (
    ehObjetoJson(valor) &&
    typeof valor.profissionalId === 'string' &&
    typeof valor.score === 'number' &&
    typeof valor.custo === 'number'
  );
}
