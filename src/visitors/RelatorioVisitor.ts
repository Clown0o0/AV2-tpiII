import type { Profissional } from '../domain/entities/Profissional';
import type { DetalhesProjeto, PapelTecnico, Projeto } from '../domain/entities/Projeto';
import type { MembroRecomendadoLeitura, Recomendacao, StatusMembro } from '../domain/entities/Recomendacao';
import { VisitanteBase } from './VisitanteBase';

export interface LinhaEquipe {
  papel: PapelTecnico;
  profissionalId: string;
  nome: string;
  status: StatusMembro;
  score: number;
  custo: number;
  mediaAvaliacoes: number | null;
  localizacao: string;
}

export interface ResumoProjeto {
  id: string;
  titulo: string;
  genero: string;
  tipoCaptacao: string;
  localizacao: string;
  duracaoEstimadaMin: number;
  dataEntrega: string;
  detalhes: DetalhesProjeto | null;
}

export interface ResumoRecomendacao {
  id: string;
  estrategia: string;
  status: string;
  parcial: boolean;
  rodadas: number;
  avisos: string[];
}

export interface ResumoFinanceiro {
  orcamentoTotal: number;
  custoEquipe: number;
  saldo: number;
  percentualUtilizado: number;
}

export interface Relatorio {
  projeto: ResumoProjeto;
  recomendacao: ResumoRecomendacao;
  equipe: LinhaEquipe[];
  papeisEmAberto: PapelTecnico[];
  financeiro: ResumoFinanceiro;
  texto: string;
}

// Gera o relatório completo da equipe para o produtor (estruturado + texto legível).
export class RelatorioVisitor extends VisitanteBase<Relatorio> {
  private recomendacao: Recomendacao | undefined;
  private readonly membros: MembroRecomendadoLeitura[] = [];
  private readonly profissionais = new Map<string, Profissional>();

  override visitarRecomendacao(recomendacao: Recomendacao): void {
    this.recomendacao = recomendacao;
  }

  override visitarMembro(membro: MembroRecomendadoLeitura): void {
    this.membros.push(membro);
  }

  override visitarProfissional(profissional: Profissional): void {
    this.profissionais.set(profissional.id, profissional);
  }

  resultado(): Relatorio {
    const recomendacao = this.recomendacao;
    if (!recomendacao) throw new Error('Visitor não percorreu projeto e recomendação');
    const projeto = this.obterProjetoVisitado();
    const equipe = this.membros.map((membro) => this.linhaDaEquipe(membro));
    const papeisEmAberto = papeisSemMembro(projeto, equipe);
    const financeiro = calcularFinanceiro(projeto.orcamentoTotal, equipe);
    return {
      projeto: resumirProjeto(projeto),
      recomendacao: resumirRecomendacao(recomendacao),
      equipe,
      papeisEmAberto,
      financeiro,
      texto: formatarTexto(projeto, recomendacao, equipe, papeisEmAberto, financeiro),
    };
  }

  private linhaDaEquipe(membro: MembroRecomendadoLeitura): LinhaEquipe {
    const profissional = this.profissionais.get(membro.profissionalId);
    return {
      papel: membro.papel,
      profissionalId: membro.profissionalId,
      nome: profissional?.nome ?? '(profissional indisponível)',
      status: membro.status,
      score: membro.score,
      custo: membro.custo,
      mediaAvaliacoes: profissional?.mediaAvaliacoes() ?? null,
      localizacao: profissional?.localizacao ?? '-',
    };
  }
}

function papeisSemMembro(projeto: Projeto, equipe: readonly LinhaEquipe[]): PapelTecnico[] {
  const preenchidos = new Set(equipe.map((linha) => linha.papel));
  return projeto.papeis.map((p) => p.papel).filter((papel) => !preenchidos.has(papel));
}

export function custoDaEquipe(equipe: readonly LinhaEquipe[]): number {
  return equipe.reduce((soma, linha) => soma + linha.custo, 0);
}

function calcularFinanceiro(orcamentoTotal: number, equipe: readonly LinhaEquipe[]): ResumoFinanceiro {
  const custoEquipe = custoDaEquipe(equipe);
  return {
    orcamentoTotal,
    custoEquipe,
    saldo: orcamentoTotal - custoEquipe,
    percentualUtilizado: Math.round((custoEquipe / orcamentoTotal) * 10000) / 100,
  };
}

function resumirProjeto(projeto: Projeto): ResumoProjeto {
  return {
    id: projeto.id,
    titulo: projeto.titulo,
    genero: projeto.genero,
    tipoCaptacao: projeto.tipoCaptacao,
    localizacao: projeto.localizacao,
    duracaoEstimadaMin: projeto.duracaoEstimadaMin,
    dataEntrega: projeto.dataEntrega.toISOString(),
    detalhes: projeto.detalhes,
  };
}

function resumirRecomendacao(recomendacao: Recomendacao): ResumoRecomendacao {
  return {
    id: recomendacao.id,
    estrategia: recomendacao.estrategia,
    status: recomendacao.status,
    parcial: recomendacao.parcial,
    rodadas: recomendacao.rodadas,
    avisos: [...recomendacao.avisos],
  };
}

function formatarTexto(
  projeto: Projeto,
  recomendacao: Recomendacao,
  equipe: readonly LinhaEquipe[],
  papeisEmAberto: readonly PapelTecnico[],
  financeiro: ResumoFinanceiro,
): string {
  return [
    ...linhasDoCabecalho(projeto, recomendacao),
    '',
    'Equipe:',
    ...equipe.map(formatarLinhaDaEquipe),
    ...papeisEmAberto.map((papel) => `  - ${papel}: (em aberto)`),
    '',
    formatarFinanceiro(financeiro),
    ...recomendacao.avisos.map((aviso) => `Aviso: ${aviso}`),
  ].join('\n');
}

function linhasDoCabecalho(projeto: Projeto, recomendacao: Recomendacao): string[] {
  return [
    `Relatório da equipe — ${projeto.titulo}`,
    `Gênero: ${projeto.genero} | Captação: ${projeto.tipoCaptacao} | Local: ${projeto.localizacao}`,
    ...(projeto.detalhes ? [`Detalhes do tipo: ${JSON.stringify(projeto.detalhes)}`] : []),
    `Entrega: ${projeto.dataEntrega.toISOString().slice(0, 10)} | Duração estimada: ${projeto.duracaoEstimadaMin} min`,
    `Estratégia: ${recomendacao.estrategia} | Status: ${recomendacao.status} | Rodadas: ${recomendacao.rodadas}`,
  ];
}

function formatarLinhaDaEquipe(linha: LinhaEquipe): string {
  return `  - ${linha.papel}: ${linha.nome} [${linha.status}] score=${linha.score.toFixed(2)} custo=${linha.custo.toFixed(2)}`;
}

function formatarFinanceiro(financeiro: ResumoFinanceiro): string {
  return (
    `Orçamento: ${financeiro.orcamentoTotal.toFixed(2)} | Custo da equipe: ${financeiro.custoEquipe.toFixed(2)} ` +
    `(${financeiro.percentualUtilizado}%) | Saldo: ${financeiro.saldo.toFixed(2)}`
  );
}
