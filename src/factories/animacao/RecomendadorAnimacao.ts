import { RecomendadorPorTipo } from '../../strategies/RecomendadorPorTipo';

// Competências valorizadas: animação depende de efeitos visuais, 3D e composição.
export const COMPETENCIAS_ANIMACAO = ['vfx', 'animacao_3d', 'composicao'] as const;

export class RecomendadorAnimacao extends RecomendadorPorTipo {
  protected readonly competenciasValorizadas = COMPETENCIAS_ANIMACAO;
}
