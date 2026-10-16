import type { Profissional } from '../entities/Profissional';

export interface ProfissionalRepository {
  listarTodos(): Promise<Profissional[]>;
  buscarPorIds(ids: readonly string[]): Promise<Profissional[]>;
}
