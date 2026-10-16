import type { Convite } from '../entities/Convite';

export interface ConviteRepository {
  salvarConvite(convite: Convite): Promise<void>;
  buscarConvite(id: string): Promise<Convite | null>;
  listarConvites(recomendacaoId: string): Promise<Convite[]>;
}
