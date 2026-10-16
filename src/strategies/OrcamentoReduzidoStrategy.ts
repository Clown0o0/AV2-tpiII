import type { Profissional } from '../domain/entities/Profissional';
import {
  arredondar,
  ordenarRanking,
  type CandidatoPontuado,
  type ContextoEstrategia,
  type RecomendacaoStrategy,
} from './RecomendacaoStrategy';

export interface RegrasOrcamentoReduzido {
  // Média mínima exigida de quem já tem avaliações suficientes.
  notaMinima: number;
  // Nº de avaliações a partir do qual a nota mínima é aplicada.
  avaliacoesParaExigirNota: number;
  pesoEconomia: number;
  pesoLocalizacao: number;
  pesoReputacao: number;
  // Reputação assumida para quem ainda não foi avaliado (0..1).
  reputacaoPadrao: number;
}

// Regras padrão para orçamento reduzido.
// Para usar outras, passe um objeto diferente no construtor.
export const REGRAS_PADRAO: RegrasOrcamentoReduzido = {
  notaMinima: 3,
  avaliacoesParaExigirNota: 2,
  pesoEconomia: 0.5,
  pesoLocalizacao: 0.3,
  pesoReputacao: 0.2,
  reputacaoPadrao: 0.6,
};

// Tira quem cobra mais que a fatia do papel ou tem nota baixa comprovada; entre o resto,
// favorece quem é mais barato, da mesma cidade e bem avaliado.
export class OrcamentoReduzidoStrategy implements RecomendacaoStrategy {
  readonly tipo = 'ORCAMENTO_REDUZIDO' as const;
  readonly descricao = 'Regras de negócio para orçamento reduzido: economia, profissionais locais e reputação mínima';

  constructor(private readonly regras: RegrasOrcamentoReduzido = REGRAS_PADRAO) {}

  recomendar(candidatos: readonly Profissional[], contexto: ContextoEstrategia): CandidatoPontuado[] {
    const elegiveis = candidatos.filter((profissional) => this.elegivel(profissional, contexto.orcamentoPapel));
    return ordenarRanking(elegiveis.map((profissional) => this.pontuar(profissional, contexto)));
  }

  private elegivel(profissional: Profissional, orcamentoPapel: number): boolean {
    return profissional.precoMin <= orcamentoPapel && !this.temReputacaoRuimComprovada(profissional);
  }

  private temReputacaoRuimComprovada(profissional: Profissional): boolean {
    const media = profissional.mediaAvaliacoes();
    return media !== null && profissional.avaliacoes.length >= this.regras.avaliacoesParaExigirNota && media < this.regras.notaMinima;
  }

  private pontuar(profissional: Profissional, contexto: ContextoEstrategia): CandidatoPontuado {
    const r = this.regras;
    const economia = contexto.orcamentoPapel > 0 ? 1 - profissional.precoMin / contexto.orcamentoPapel : 0;
    const local = profissional.proximidadeDe(contexto.projeto.localizacao);
    const reputacao = profissional.reputacao(r.reputacaoPadrao);
    const score = r.pesoEconomia * economia + r.pesoLocalizacao * local + r.pesoReputacao * reputacao;
    return {
      profissional,
      score: arredondar(score),
      detalhes: { economia: arredondar(economia), local, reputacao: arredondar(reputacao) },
    };
  }
}
