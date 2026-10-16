import type { Convite, StatusConvite } from '../domain/entities/Convite';
import type {
  DetalhesProjeto,
  PapelRequerido,
  PapelTecnico,
  Projeto,
  TipoCaptacao,
  TipoEstrategia,
} from '../domain/entities/Projeto';
import type {
  Alternativa,
  MembroRecomendadoLeitura,
  Recomendacao,
  StatusMembro,
  StatusRecomendacao,
} from '../domain/entities/Recomendacao';

export interface ProjetoJson {
  id: string;
  titulo: string;
  produtorId: string;
  produtorEmail: string | null;
  genero: string;
  duracaoEstimadaMin: number;
  orcamentoTotal: number;
  dataEntrega: string;
  tipoCaptacao: TipoCaptacao;
  localizacao: string;
  estrategia: TipoEstrategia;
  papeis: readonly PapelRequerido[];
  detalhes: DetalhesProjeto | null;
}

export interface MembroJson {
  id: string;
  papel: PapelTecnico;
  profissionalId: string;
  score: number;
  custo: number;
  status: StatusMembro;
  rodada: number;
  alternativas: readonly Alternativa[];
}

export interface RecomendacaoJson {
  id: string;
  projetoId: string;
  estrategia: TipoEstrategia;
  status: StatusRecomendacao;
  parcial: boolean;
  avisos: readonly string[];
  rodadas: number;
  custoTotal: number;
  criadaEm: string;
  finalizadaEm: string | null;
  equipe: MembroJson[];
  historico: MembroJson[];
}

export interface ConviteJson {
  id: string;
  recomendacaoId: string;
  projetoId: string;
  profissionalId: string;
  papel: PapelTecnico;
  status: StatusConvite;
  criadoEm: string;
  respondidoEm: string | null;
}

export function projetoJson(projeto: Projeto): ProjetoJson {
  return {
    id: projeto.id,
    titulo: projeto.titulo,
    produtorId: projeto.produtorId,
    produtorEmail: projeto.produtorEmail,
    genero: projeto.genero,
    duracaoEstimadaMin: projeto.duracaoEstimadaMin,
    orcamentoTotal: projeto.orcamentoTotal,
    dataEntrega: projeto.dataEntrega.toISOString(),
    tipoCaptacao: projeto.tipoCaptacao,
    localizacao: projeto.localizacao,
    estrategia: projeto.estrategia,
    papeis: projeto.papeis,
    detalhes: projeto.detalhes,
  };
}

export function membroJson(membro: MembroRecomendadoLeitura): MembroJson {
  return {
    id: membro.id,
    papel: membro.papel,
    profissionalId: membro.profissionalId,
    score: membro.score,
    custo: membro.custo,
    status: membro.status,
    rodada: membro.rodada,
    alternativas: membro.alternativas,
  };
}

export function recomendacaoJson(recomendacao: Recomendacao): RecomendacaoJson {
  return {
    id: recomendacao.id,
    projetoId: recomendacao.projetoId,
    estrategia: recomendacao.estrategia,
    status: recomendacao.status,
    parcial: recomendacao.parcial,
    avisos: recomendacao.avisos,
    rodadas: recomendacao.rodadas,
    custoTotal: recomendacao.custoTotal(),
    criadaEm: recomendacao.criadaEm.toISOString(),
    finalizadaEm: recomendacao.finalizadaEm?.toISOString() ?? null,
    equipe: recomendacao.membrosAtivos().map(membroJson),
    historico: recomendacao.membros.filter((m) => !m.ativo).map(membroJson),
  };
}

export function conviteJson(convite: Convite): ConviteJson {
  return {
    id: convite.id,
    recomendacaoId: convite.recomendacaoId,
    projetoId: convite.projetoId,
    profissionalId: convite.profissionalId,
    papel: convite.papel,
    status: convite.status,
    criadoEm: convite.criadoEm.toISOString(),
    respondidoEm: convite.respondidoEm?.toISOString() ?? null,
  };
}
