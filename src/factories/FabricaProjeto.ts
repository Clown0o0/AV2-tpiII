import type { DadosProjeto, Projeto, TipoCaptacao } from '../domain/entities/Projeto';
import type { Observador } from '../events/RecomendacaoEventEmitter';
import type { LoggerEstruturado } from '../events/observers/AuditoriaObserver';
import { CossenoStrategy } from '../strategies/CossenoStrategy';
import type { RecomendacaoStrategy } from '../strategies/RecomendacaoStrategy';
import type { ProjetoVisitor } from '../visitors/ProjetoVisitor';
import type { ResultadoValidacao } from '../visitors/ValidacaoConsistenciaVisitor';

// Abstract Factory: cada tipo de projeto tem uma fábrica que cria a família inteira (projeto,
// validador, recomendador e notificador) do mesmo tipo. Cada criarX() é um Factory Method.
export interface FabricaProjeto {
  readonly tipo: TipoCaptacao;
  // A mesma fábrica, usando `base` (a estratégia escolhida pelo produtor) no recomendador.
  comEstrategia(base: RecomendacaoStrategy): FabricaProjeto;
  criarProjeto(dados: DadosProjeto): Projeto;
  criarValidador(dataReferencia?: Date): ProjetoVisitor<ResultadoValidacao>;
  criarRecomendador(): RecomendacaoStrategy;
  criarNotificador(): Observador;
}

export interface OpcoesFabrica {
  // Estratégia que o recomendador do tipo decora (padrão: cosseno, a mesma do Projeto).
  estrategiaBase: RecomendacaoStrategy;
  logger?: LoggerEstruturado;
}

// O que é comum às fábricas concretas: opções e a troca da estratégia base.
export abstract class FabricaProjetoBase implements FabricaProjeto {
  abstract readonly tipo: TipoCaptacao;
  protected readonly opcoes: OpcoesFabrica;

  constructor(opcoes: Partial<OpcoesFabrica> = {}) {
    this.opcoes = { estrategiaBase: new CossenoStrategy(), ...opcoes };
  }

  // As fábricas concretas mantêm o construtor (opcoes) desta base, então a cópia é da mesma classe.
  comEstrategia(base: RecomendacaoStrategy): FabricaProjeto {
    const Fabrica = this.constructor as new (opcoes: Partial<OpcoesFabrica>) => FabricaProjeto;
    return new Fabrica({ ...this.opcoes, estrategiaBase: base });
  }

  abstract criarProjeto(dados: DadosProjeto): Projeto;
  abstract criarValidador(dataReferencia?: Date): ProjetoVisitor<ResultadoValidacao>;
  abstract criarRecomendador(): RecomendacaoStrategy;
  abstract criarNotificador(): Observador;
}
