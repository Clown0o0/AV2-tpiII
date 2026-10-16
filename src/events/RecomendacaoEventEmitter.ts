// submarino
import { EventEmitter } from 'node:events';
import type { EventoDe, EventoRecomendacao, MapaEventos, NomeEvento } from './EventTypes';
import type { PublicadorEventos } from './PublicadorEventos';

export type TratadorFalha = (erro: unknown, evento: NomeEvento, observador: string) => void;

export interface Observador {
  readonly nome: string;
  atualizar(evento: EventoRecomendacao): void | Promise<void>;
}

export interface Publicador {
  adicionar(observador: Observador): void;
  remover(observador: Observador): void;
  notificar<E extends NomeEvento>(evento: EventoDe<E>): void;
}

const CANAL = 'evento';

export class RecomendacaoEventEmitter implements Publicador, PublicadorEventos {
  private readonly emitter = new EventEmitter();
  private readonly pendentes = new Set<Promise<void>>();
  private readonly listeners = new Map<Observador, (evento: EventoRecomendacao) => void>();

  constructor(private readonly tratadorFalha: TratadorFalha = () => {}) {
    this.emitter.setMaxListeners(100);
  }

  adicionar(observador: Observador): void {
    if (this.listeners.has(observador)) return;
    const listener = (evento: EventoRecomendacao): void => {
      const tarefa = this.executarIsolado(evento.nome, observador.nome, () => observador.atualizar(evento));
      this.pendentes.add(tarefa);
      void tarefa.finally(() => this.pendentes.delete(tarefa));
    };
    this.listeners.set(observador, listener);
    this.emitter.on(CANAL, listener);
  }

  remover(observador: Observador): void {
    const listener = this.listeners.get(observador);
    if (!listener) return;
    this.emitter.off(CANAL, listener);
    this.listeners.delete(observador);
  }

  notificar<E extends NomeEvento>(evento: EventoDe<E>): void {
    this.emitter.emit(CANAL, evento);
  }

  registrar(...observadores: Observador[]): this {
    for (const observador of observadores) this.adicionar(observador);
    return this;
  }

  publicar<E extends NomeEvento>(nome: E, payload: MapaEventos[E]): void {
    this.notificar({ nome, payload });
  }

  quantidadeObservadores(): number {
    return this.listeners.size;
  }

  async aguardarPendentes(): Promise<void> {
    while (this.pendentes.size > 0) await Promise.allSettled([...this.pendentes]);
  }

  private async executarIsolado(evento: NomeEvento, observador: string, rodar: () => void | Promise<void>): Promise<void> {
    await esperarFimDoFluxoDeQuemPublicou();
    try {
      await rodar();
    } catch (erro) {
      this.informarFalhaSemPropagar(erro, evento, observador);
    }
  }

  private informarFalhaSemPropagar(erro: unknown, evento: NomeEvento, observador: string): void {
    try {
      this.tratadorFalha(erro, evento, observador);
    } catch {
      // um tratador com defeito não pode derrubar os outros observadores
    }
  }
}

function esperarFimDoFluxoDeQuemPublicou(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
