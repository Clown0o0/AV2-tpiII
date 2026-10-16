import type { MapaEventos, NomeEvento } from './EventTypes';

export interface PublicadorEventos {
  publicar<E extends NomeEvento>(nome: E, payload: MapaEventos[E]): void;
}
