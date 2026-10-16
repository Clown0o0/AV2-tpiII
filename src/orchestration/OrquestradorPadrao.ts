import { ErroValidacao } from '../domain/errors';
import type { Profissional } from '../domain/entities/Profissional';
import type { PapelRequerido, PapelTecnico } from '../domain/entities/Projeto';
import type { FabricaProjeto } from '../factories/FabricaProjeto';
import type { CandidatoPontuado } from '../strategies/RecomendacaoStrategy';
import {
  custoDosMembrosFixos,
  OrquestradorEquipe,
  type EntradaNormalizada,
  type EntradaOrquestracao,
  type PapelNormalizado,
  type RankingPapel,
  type ResultadoOrquestracao,
  type SelecaoPapel,
} from './OrquestradorEquipe';

export const LIMITE_ALTERNATIVAS_PADRAO = 3;

export interface OpcoesOrquestrador {
  limiteAlternativas: number;
}

interface ContextoDeNormalizacao {
  entrada: EntradaOrquestracao;
  orcamentoDisponivel: number;
  idsFixos: ReadonlySet<string>;
  candidatosPorPapel: ReadonlyMap<PapelTecnico, Profissional[]>;
  somaPesos: number;
}

// O ranking vem do recomendador criado pela fábrica recebida, então este orquestrador não
// conhece o tipo de projeto. O custo de um profissional é o preço mínimo da faixa dele.
export class OrquestradorPadrao extends OrquestradorEquipe {
  private readonly opcoes: OpcoesOrquestrador;

  constructor(
    private readonly fabrica: FabricaProjeto,
    opcoes: Partial<OpcoesOrquestrador> = {},
  ) {
    super();
    this.opcoes = { limiteAlternativas: LIMITE_ALTERNATIVAS_PADRAO, ...opcoes };
  }

  protected validarRestricoes(entrada: EntradaOrquestracao): void {
    const { projeto } = entrada;
    if (projeto.dataEntrega.getTime() <= entrada.dataReferencia.getTime()) {
      throw new ErroValidacao('A data de entrega do projeto já passou; não há prazo para compor a equipe');
    }
    const custoFixo = custoDosMembrosFixos(entrada.membrosFixos);
    if (custoFixo > projeto.orcamentoTotal) {
      throw new ErroValidacao(`Custo dos membros já definidos (${custoFixo}) excede o orçamento total (${projeto.orcamentoTotal})`);
    }
    const requeridos = new Set(projeto.papeis.map((p) => p.papel));
    const naoRequerido = (entrada.papeisAlvo ?? []).find((papel) => !requeridos.has(papel));
    if (naoRequerido) throw new ErroValidacao(`Papel ${naoRequerido} não é requerido pelo projeto`);
  }

  protected normalizarDados(entrada: EntradaOrquestracao): EntradaNormalizada {
    const { projeto } = entrada;
    const universo = semProfissionaisRepetidos(entrada.profissionais);
    const alvo = new Set<PapelTecnico>(entrada.papeisAlvo ?? projeto.papeis.map((p) => p.papel));
    const requeridos = projeto.papeis.filter((p) => alvo.has(p.papel));
    const contexto: ContextoDeNormalizacao = {
      entrada,
      orcamentoDisponivel: projeto.orcamentoTotal - custoDosMembrosFixos(entrada.membrosFixos),
      idsFixos: new Set((entrada.membrosFixos ?? []).map((m) => m.profissionalId)),
      candidatosPorPapel: agruparPorEspecialidade(universo, alvo),
      somaPesos: requeridos.reduce((soma, p) => soma + p.peso, 0),
    };
    const papeis = requeridos.map((requerido) => normalizarPapel(contexto, requerido));
    const { estrategia, dataReferencia } = entrada;
    return { projeto, estrategia, dataReferencia, orcamentoDisponivel: contexto.orcamentoDisponivel, papeis, universo, avisos: [] };
  }

  protected aplicarEstrategia(entrada: EntradaNormalizada): RankingPapel[] {
    const recomendador = this.fabrica.comEstrategia(entrada.estrategia).criarRecomendador();
    return entrada.papeis.map((papel) => ({
      papel,
      ranking: recomendador.recomendar(papel.candidatos, {
        projeto: entrada.projeto,
        papel: papel.papel,
        perfilDesejado: papel.perfilDesejado,
        orcamentoPapel: papel.orcamentoPapel,
        universo: entrada.universo,
      }),
    }));
  }

  protected posProcessar(rankings: RankingPapel[], entrada: EntradaNormalizada): ResultadoOrquestracao {
    const escolha = new EscolhaGulosa(entrada.orcamentoDisponivel, this.opcoes.limiteAlternativas, entrada.avisos);
    const ordemDeEscolha = [...rankings].sort((a, b) => b.papel.peso - a.papel.peso);
    ordemDeEscolha.forEach((rankingDoPapel, i) => escolha.escolherPara(rankingDoPapel, ordemDeEscolha.slice(i + 1)));
    const selecionados = rankings.flatMap((r) => escolha.selecaoDe(r.papel.papel) ?? []);
    return {
      estrategia: entrada.estrategia.tipo,
      selecionados,
      papeisSemCandidato: escolha.papeisSemCandidato,
      custoTotal: selecionados.reduce((soma, s) => soma + s.custo, 0),
      orcamentoDisponivel: entrada.orcamentoDisponivel,
      parcial: escolha.papeisSemCandidato.length > 0,
      avisos: escolha.avisos,
    };
  }
}

function semProfissionaisRepetidos(profissionais: readonly Profissional[]): Profissional[] {
  const porId = new Map<string, Profissional>();
  for (const profissional of profissionais) if (!porId.has(profissional.id)) porId.set(profissional.id, profissional);
  return [...porId.values()];
}

function agruparPorEspecialidade(universo: readonly Profissional[], alvo: ReadonlySet<PapelTecnico>): Map<PapelTecnico, Profissional[]> {
  const porPapel = new Map<PapelTecnico, Profissional[]>();
  for (const profissional of universo) {
    const { especialidades } = profissional;
    for (const [i, papel] of especialidades.entries()) {
      // Ignora a especialidade repetida e a que não está no alvo.
      if (especialidades.indexOf(papel) !== i || !alvo.has(papel)) continue;
      const lista = porPapel.get(papel);
      if (lista) lista.push(profissional);
      else porPapel.set(papel, [profissional]);
    }
  }
  return porPapel;
}

function normalizarPapel(contexto: ContextoDeNormalizacao, requerido: PapelRequerido): PapelNormalizado {
  const { entrada, orcamentoDisponivel } = contexto;
  const peso = requerido.peso / contexto.somaPesos;
  const excluidos = entrada.excluidosPorPapel?.get(requerido.papel);
  // Lida uma vez: o getter devolve uma cópia nova da data a cada leitura.
  const dataEntrega = entrada.projeto.dataEntrega;
  const candidatos = (contexto.candidatosPorPapel.get(requerido.papel) ?? []).filter(
    (p) =>
      !contexto.idsFixos.has(p.id) &&
      !excluidos?.has(p.id) &&
      p.precoMin <= orcamentoDisponivel &&
      p.disponivelEntre(entrada.dataReferencia, dataEntrega),
  );
  return {
    papel: requerido.papel,
    pesoOriginal: requerido.peso,
    peso,
    perfilDesejado: entrada.projeto.perfilDesejado(requerido.papel),
    orcamentoPapel: orcamentoDisponivel * peso,
    candidatos,
  };
}

// Escolha gulosa: os papéis de maior peso escolhem primeiro e guardam, para cada papel seguinte,
// o preço do candidato mais barato ainda livre.
class EscolhaGulosa {
  private readonly _papeisSemCandidato: PapelTecnico[] = [];
  private readonly _avisos: string[];
  private readonly usados = new Set<string>();
  private readonly selecoes = new Map<PapelTecnico, SelecaoPapel>();
  private restante: number;

  constructor(
    orcamentoDisponivel: number,
    private readonly limiteAlternativas: number,
    avisosAnteriores: readonly string[],
  ) {
    this.restante = orcamentoDisponivel;
    this._avisos = [...avisosAnteriores];
  }

  get papeisSemCandidato(): PapelTecnico[] {
    return [...this._papeisSemCandidato];
  }

  get avisos(): string[] {
    return [...this._avisos];
  }

  escolherPara({ papel, ranking }: RankingPapel, seguintes: readonly RankingPapel[]): void {
    const livres = ranking.filter((c) => !this.usados.has(c.profissional.id));
    const escolhido = this.candidatoQueCabe(papel.papel, livres, this.reservaPara(seguintes));
    if (escolhido) this.registrarEscolha(papel.papel, escolhido, livres);
    else this.registrarPapelSemCandidato(papel.papel, ranking);
  }

  selecaoDe(papel: PapelTecnico): SelecaoPapel | undefined {
    return this.selecoes.get(papel);
  }

  private candidatoQueCabe(papel: PapelTecnico, livres: readonly CandidatoPontuado[], reserva: number): CandidatoPontuado | undefined {
    const comReserva = livres.find((c) => c.profissional.precoMin <= this.restante - reserva);
    if (comReserva) return comReserva;
    const usandoReserva = livres.find((c) => c.profissional.precoMin <= this.restante);
    if (usandoReserva) this._avisos.push(`Papel ${papel}: escolha consome orçamento reservado para outros papéis`);
    return usandoReserva;
  }

  private reservaPara(seguintes: readonly RankingPapel[]): number {
    return seguintes.reduce((soma, seguinte) => soma + this.menorPrecoLivre(seguinte.ranking), 0);
  }

  private menorPrecoLivre(ranking: readonly CandidatoPontuado[]): number {
    const precos = ranking.filter((c) => !this.usados.has(c.profissional.id)).map((c) => c.profissional.precoMin);
    return precos.length > 0 ? Math.min(...precos) : 0;
  }

  private registrarEscolha(papel: PapelTecnico, escolhido: CandidatoPontuado, livres: readonly CandidatoPontuado[]): void {
    this.usados.add(escolhido.profissional.id);
    this.restante -= escolhido.profissional.precoMin;
    const alternativas = livres
      .filter((c) => c !== escolhido)
      .slice(0, this.limiteAlternativas)
      .map((candidato) => ({ candidato, custo: candidato.profissional.precoMin }));
    this.selecoes.set(papel, { papel, escolhido, custo: escolhido.profissional.precoMin, alternativas });
  }

  private registrarPapelSemCandidato(papel: PapelTecnico, ranking: readonly CandidatoPontuado[]): void {
    this._papeisSemCandidato.push(papel);
    this._avisos.push(
      ranking.length === 0
        ? `Papel ${papel}: nenhum profissional elegível (especialidade, disponibilidade ou orçamento)`
        : `Papel ${papel}: nenhum candidato cabe no orçamento restante (${this.restante})`,
    );
  }
}
