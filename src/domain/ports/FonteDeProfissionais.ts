import type { PapelTecnico } from '../entities/Projeto';
import type { Profissional } from '../entities/Profissional';

export type OrigemDosProfissionais = 'REPOSITORIO' | 'CACHE' | 'INDISPONIVEL';

export interface FiltroCandidatos {
  // Profissionais que atuam em pelo menos um destes papéis.
  papeis: readonly PapelTecnico[];
  // Janela que o profissional precisa ter disponível por inteiro.
  disponivelDe: Date;
  disponivelAte: Date;
  precoMinMaximo?: number;
}

export interface ResultadoBusca {
  profissionais: Profissional[];
  fonte: OrigemDosProfissionais;
  erro?: string;
}

export interface FonteDeProfissionais {
  buscarCandidatos(filtro: FiltroCandidatos): Promise<ResultadoBusca>;
  buscarPorIds(ids: readonly string[]): Promise<ResultadoBusca>;
  invalidar(): void;
}

export interface CicloDeVidaDoCatalogo {
  iniciar(): Promise<void>;
  parar(): void;
}
