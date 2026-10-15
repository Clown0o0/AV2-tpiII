import type { Profissional } from '../domain/entities/Profissional';
import type { TipoEstrategia } from '../domain/entities/Projeto';
import {
  arredondar,
  ordenarRanking,
  type CandidatoPontuado,
  type ContextoEstrategia,
  type RecomendacaoStrategy,
} from './RecomendacaoStrategy';

// Peso da afinidade: o score final é 80% o da estratégia base e 20% a afinidade com o tipo.
export const PESO_AFINIDADE_TIPO = 0.2;

// Decorator da estratégia escolhida pelo produtor: mantém as regras dela (inclusive os descartes)
// e ajusta o score pelas competências que o tipo de projeto valoriza. `tipo` e `descricao` são
// os da base, então a API e Recomendacao.estrategia continuam mostrando a estratégia escolhida.
export abstract class RecomendadorPorTipo implements RecomendacaoStrategy {
  protected abstract readonly competenciasValorizadas: readonly string[];

  constructor(readonly base: RecomendacaoStrategy) {}

  get tipo(): TipoEstrategia {
    return this.base.tipo;
  }

  get descricao(): string {
    return this.base.descricao;
  }

  recomendar(candidatos: readonly Profissional[], contexto: ContextoEstrategia): CandidatoPontuado[] {
    return ordenarRanking(
      this.base.recomendar(candidatos, contexto).map((candidato) => {
        const afinidade = this.afinidade(candidato.profissional);
        return {
          profissional: candidato.profissional,
          score: arredondar((1 - PESO_AFINIDADE_TIPO) * candidato.score + PESO_AFINIDADE_TIPO * afinidade),
          detalhes: { ...candidato.detalhes, scoreBase: candidato.score, afinidadeTipo: arredondar(afinidade) },
        };
      }),
    );
  }

  // Média dos níveis (0..1) do profissional nas competências valorizadas pelo tipo.
  private afinidade(profissional: Profissional): number {
    const vetor = profissional.vetorCompetencias();
    const soma = this.competenciasValorizadas.reduce((total, nome) => total + (vetor[nome] ?? 0), 0);
    return soma / this.competenciasValorizadas.length;
  }
}
