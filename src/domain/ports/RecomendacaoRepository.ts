import type { Recomendacao } from '../entities/Recomendacao';

export interface RecomendacaoRepository {
  salvarRecomendacao(recomendacao: Recomendacao): Promise<void>;
  buscarRecomendacao(id: string): Promise<Recomendacao | null>;
  // A mais recente do projeto que não esteja obsoleta.
  buscarRecomendacaoVigente(projetoId: string): Promise<Recomendacao | null>;
}
