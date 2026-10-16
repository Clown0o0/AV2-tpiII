import type { ResultadoAlteracao } from '../domain/entities/Projeto';

export const LIMITE_VARIACAO_ORCAMENTO = 0.1;
export const LIMITE_VARIACAO_PRAZO_DIAS = 7;

export interface LimiaresReavaliacao {
  variacaoOrcamento: number;
  variacaoPrazoDias: number;
}

export const LIMIARES_PADRAO: LimiaresReavaliacao = {
  variacaoOrcamento: LIMITE_VARIACAO_ORCAMENTO,
  variacaoPrazoDias: LIMITE_VARIACAO_PRAZO_DIAS,
};

export interface CriterioDeReavaliacao {
  deveReavaliar(alteracao: ResultadoAlteracao, forcar: boolean): boolean;
}

// Uma alteração é significativa quando muda a estratégia ou passa de um dos limiares.
export class PoliticaDeReavaliacao implements CriterioDeReavaliacao {
  constructor(private readonly limiares: LimiaresReavaliacao) {}

  deveReavaliar(alteracao: ResultadoAlteracao, forcar: boolean): boolean {
    return (
      forcar ||
      alteracao.estrategiaAlterada ||
      alteracao.variacaoOrcamento >= this.limiares.variacaoOrcamento ||
      alteracao.variacaoPrazoDias >= this.limiares.variacaoPrazoDias
    );
  }
}
