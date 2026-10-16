import type { PapelTecnico, Projeto } from '../domain/entities/Projeto';
import type { Profissional } from '../domain/entities/Profissional';
import { MembroRecomendado, Recomendacao, type MembroRecomendadoLeitura } from '../domain/entities/Recomendacao';
import type {
  FiltroCandidatos,
  FonteDeProfissionais,
  OrigemDosProfissionais,
  ResultadoBusca,
} from '../domain/ports/FonteDeProfissionais';
import type { CatalogoFabricas } from '../factories/FabricaProjeto';
import {
  custoDosMembrosFixos,
  type EntradaOrquestracao,
  type MembroFixo,
  type ResultadoOrquestracao,
  type SelecaoPapel,
} from '../orchestration/OrquestradorEquipe';
import type { CatalogoEstrategias, RecomendacaoStrategy } from '../strategies/RecomendacaoStrategy';
import type { CriadorDeOrquestrador, Relogio } from './contratos';

export interface EquipeRecomendada {
  recomendacao: Recomendacao;
  fonte: OrigemDosProfissionais;
  sugeridos: Profissional[];
}

export interface Substituto {
  novoMembro: MembroRecomendadoLeitura | null;
  profissionalNovo: Profissional | null;
}

export interface RecomendadorDeEquipes {
  recomendarEquipe(projeto: Projeto): Promise<EquipeRecomendada>;
  recomendarSubstituto(
    projeto: Projeto,
    recomendacao: Recomendacao,
    papel: PapelTecnico,
    estrategia: RecomendacaoStrategy,
  ): Promise<Substituto>;
}

export interface DependenciasOrquestradorDeRecomendacao {
  fabricas: CatalogoFabricas;
  estrategias: CatalogoEstrategias;
  profissionais: FonteDeProfissionais;
  criarOrquestrador: CriadorDeOrquestrador;
  relogio: Relogio;
}

interface Orquestracao {
  busca: ResultadoBusca;
  resultado: ResultadoOrquestracao;
}

const AVISO_POR_ORIGEM: Readonly<Record<OrigemDosProfissionais, ((erro?: string) => string) | null>> = {
  REPOSITORIO: null,
  CACHE: (erro) => `Repositório de profissionais indisponível (${erro}); recomendação parcial baseada em cache`,
  INDISPONIVEL: (erro) => `Repositório de profissionais indisponível (${erro}); nenhuma sugestão pôde ser gerada`,
};

// Monta a equipe (ou o substituto de um papel) com o orquestrador da fábrica do tipo do projeto.
export class OrquestradorDeRecomendacao implements RecomendadorDeEquipes {
  constructor(private readonly deps: DependenciasOrquestradorDeRecomendacao) {}

  async recomendarEquipe(projeto: Projeto): Promise<EquipeRecomendada> {
    const agora = this.deps.relogio();
    const estrategia = this.deps.estrategias.obter(projeto.estrategia);
    const filtro = filtroDosCandidatos(projeto, projeto.papeis.map((p) => p.papel), agora, projeto.orcamentoTotal);
    const { busca, resultado } = await this.orquestrarConfirmando(filtro, (profissionais) => ({
      projeto,
      profissionais,
      estrategia,
      dataReferencia: agora,
    }));
    const recomendacao = new Recomendacao({ projetoId: projeto.id, estrategia: estrategia.tipo, criadaEm: agora });
    for (const selecao of resultado.selecionados) recomendacao.adicionarMembro(criarMembro(selecao, 1));
    recomendacao.registrarResultadoRodada(resultado.parcial || busca.fonte !== 'REPOSITORIO', avisosDaRodada(resultado, busca));
    return { recomendacao, fonte: busca.fonte, sugeridos: profissionaisSugeridos(recomendacao, busca) };
  }

  // Nova rodada só para o papel: os outros membros ficam fixos e o custo deles sai do orçamento.
  async recomendarSubstituto(
    projeto: Projeto,
    recomendacao: Recomendacao,
    papel: PapelTecnico,
    estrategia: RecomendacaoStrategy,
  ): Promise<Substituto> {
    const rodada = recomendacao.iniciarNovaRodada();
    const { busca, resultado } = await this.orquestrarSubstituicao(projeto, recomendacao, papel, estrategia);
    const selecao = resultado.selecionados[0];
    const novoMembro = selecao ? criarMembro(selecao, rodada) : null;
    if (novoMembro) recomendacao.adicionarMembro(novoMembro);
    const algumPapelVazio = projeto.papeis.some((p) => !recomendacao.membroAtivo(p.papel));
    recomendacao.registrarResultadoRodada(algumPapelVazio, avisosDaRodada(resultado, busca));
    return { novoMembro, profissionalNovo: busca.profissionais.find((p) => p.id === novoMembro?.profissionalId) ?? null };
  }

  private orquestrarSubstituicao(
    projeto: Projeto,
    recomendacao: Recomendacao,
    papel: PapelTecnico,
    estrategia: RecomendacaoStrategy,
  ): Promise<Orquestracao> {
    const membrosFixos = membrosFixosDa(recomendacao);
    const agora = this.deps.relogio();
    const filtro = filtroDosCandidatos(projeto, [papel], agora, projeto.orcamentoTotal - custoDosMembrosFixos(membrosFixos));
    return this.orquestrarConfirmando(filtro, (profissionais) => ({
      projeto,
      profissionais,
      estrategia,
      dataReferencia: agora,
      papeisAlvo: [papel],
      membrosFixos,
      excluidosPorPapel: new Map([[papel, recomendacao.profissionaisJaSugeridos(papel)]]),
    }));
  }

  // Orquestra com o catálogo em memória e confere no repositório se os escolhidos ainda existem;
  // se algum foi removido, recarrega o catálogo e orquestra de novo, uma única vez.
  private async orquestrarConfirmando(
    filtro: FiltroCandidatos,
    montarEntrada: (profissionais: Profissional[]) => EntradaOrquestracao,
  ): Promise<Orquestracao> {
    const primeira = await this.orquestrar(filtro, montarEntrada);
    if (primeira.busca.fonte !== 'REPOSITORIO' || (await this.todosAindaExistem(primeira.resultado))) return primeira;
    this.deps.profissionais.invalidar();
    return this.orquestrar(filtro, montarEntrada);
  }

  private async orquestrar(
    filtro: FiltroCandidatos,
    montarEntrada: (profissionais: Profissional[]) => EntradaOrquestracao,
  ): Promise<Orquestracao> {
    const busca = await this.deps.profissionais.buscarCandidatos(filtro);
    const entrada = montarEntrada(busca.profissionais);
    const orquestrador = this.deps.criarOrquestrador(this.deps.fabricas.obter(entrada.projeto.tipoCaptacao));
    return { busca, resultado: orquestrador.orquestrar(entrada) };
  }

  private async todosAindaExistem(resultado: ResultadoOrquestracao): Promise<boolean> {
    const ids = [...new Set(resultado.selecionados.map((s) => s.escolhido.profissional.id))];
    if (ids.length === 0) return true;
    const reais = await this.deps.profissionais.buscarPorIds(ids);
    return reais.fonte !== 'REPOSITORIO' || reais.profissionais.length === ids.length;
  }
}

function filtroDosCandidatos(projeto: Projeto, papeis: PapelTecnico[], agora: Date, precoMinMaximo: number): FiltroCandidatos {
  return { papeis, disponivelDe: agora, disponivelAte: projeto.dataEntrega, precoMinMaximo };
}

function membrosFixosDa(recomendacao: Recomendacao): MembroFixo[] {
  return recomendacao.membrosAtivos().map((m) => ({ papel: m.papel, profissionalId: m.profissionalId, custo: m.custo }));
}

function criarMembro(selecao: SelecaoPapel, rodada: number): MembroRecomendado {
  return new MembroRecomendado({
    papel: selecao.papel,
    profissionalId: selecao.escolhido.profissional.id,
    score: selecao.escolhido.score,
    custo: selecao.custo,
    rodada,
    alternativas: selecao.alternativas.map((a) => ({ profissionalId: a.candidato.profissional.id, score: a.candidato.score, custo: a.custo })),
  });
}

function avisosDaRodada(resultado: ResultadoOrquestracao, busca: ResultadoBusca): string[] {
  const avisoDaOrigem = AVISO_POR_ORIGEM[busca.fonte];
  return [...resultado.avisos, ...(avisoDaOrigem ? [avisoDaOrigem(busca.erro)] : [])];
}

function profissionaisSugeridos(recomendacao: Recomendacao, busca: ResultadoBusca): Profissional[] {
  const ids = new Set(recomendacao.membrosAtivos().map((m) => m.profissionalId));
  return busca.profissionais.filter((p) => ids.has(p.id));
}
