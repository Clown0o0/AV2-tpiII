import type { DadosProjeto, Projeto, TipoCaptacao } from '../domain/entities/Projeto';
import type { Observador } from '../events/RecomendacaoEventEmitter';
import type { LoggerEstruturado } from '../events/observadores/AuditoriaObservador';
import type { RecomendacaoStrategy } from '../strategies/RecomendacaoStrategy';
import type { ProjetoVisitor } from '../visitors/ProjetoVisitor';
import type { Relatorio } from '../visitors/RelatorioVisitor';
import type { ResultadoValidacao } from '../visitors/ValidacaoConsistenciaVisitor';

// Abstract Factory: cada tipo de projeto tem uma fábrica que cria a família inteira (projeto,
// validador, recomendador, notificador e relatório) do mesmo tipo. Cada criarX() é um Factory Method.
export interface FabricaProjeto {
  readonly tipo: TipoCaptacao;
  // A mesma fábrica, usando `base` (a estratégia escolhida pelo produtor) no recomendador.
  comEstrategia(base: RecomendacaoStrategy): FabricaProjeto;
  criarProjeto(dados: DadosProjeto): Projeto;
  criarValidador(dataReferencia?: Date): ProjetoVisitor<ResultadoValidacao>;
  criarRecomendador(): RecomendacaoStrategy;
  criarNotificador(): Observador;
  criarRelatorio(): ProjetoVisitor<Relatorio>;
}

export interface CatalogoFabricas {
  obter(tipo: TipoCaptacao): FabricaProjeto;
  tipos(): TipoCaptacao[];
}

export interface OpcoesFabrica {
  // Estratégia que o recomendador do tipo decora.
  estrategiaBase: RecomendacaoStrategy;
  logger?: LoggerEstruturado;
}

// O que é comum às fábricas concretas: as opções (estratégia base e logger).
export abstract class FabricaProjetoBase implements FabricaProjeto {
  abstract readonly tipo: TipoCaptacao;
  constructor(protected readonly opcoes: OpcoesFabrica) {}

  abstract comEstrategia(base: RecomendacaoStrategy): FabricaProjeto;

  protected opcoesComEstrategia(base: RecomendacaoStrategy): OpcoesFabrica {
    return { ...this.opcoes, estrategiaBase: base };
  }

  abstract criarProjeto(dados: DadosProjeto): Projeto;
  abstract criarValidador(dataReferencia?: Date): ProjetoVisitor<ResultadoValidacao>;
  abstract criarRecomendador(): RecomendacaoStrategy;
  abstract criarNotificador(): Observador;
  abstract criarRelatorio(): ProjetoVisitor<Relatorio>;
}
