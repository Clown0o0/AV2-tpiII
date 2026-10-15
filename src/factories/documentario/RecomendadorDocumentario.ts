import { RecomendadorPorTipo } from '../../strategies/RecomendadorPorTipo';

// Competências escolhidas por nós: documentário depende de pesquisa, narrativa e som direto.
export const COMPETENCIAS_DOCUMENTARIO = ['pesquisa', 'narrativa', 'captacao_som'] as const;

export class RecomendadorDocumentario extends RecomendadorPorTipo {
  protected readonly competenciasValorizadas = COMPETENCIAS_DOCUMENTARIO;
}
