import type { Projeto } from '../entities/Projeto';

export interface ProjetoRepository {
  salvar(projeto: Projeto): Promise<void>;
  buscarPorId(id: string): Promise<Projeto | null>;
}
