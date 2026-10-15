import { EventEmitter } from 'node:events';
import type { EventoRecomendacao, MapaEventos, NomeEvento } from './EventTypes';

export type TratadorFalha = (erro: unknown, evento: NomeEvento, observador: string) => void;

export interface Observador {
  readonly nome: string;
  atualizar(evento: EventoRecomendacao): void | Promise<void>;
}

export interface Publicador {
  adicionar(observador: Observador): void;
  remover(observador: Observador): void;
  notificar(evento: EventoRecomendacao): void;
}

const CANAL = 'evento';

// Publicador do Observer, em cima do EventEmitter do Node.
// Cada observador roda depois do notificar() e isolado dos outros: se um quebrar, o erro vai
// para o tratadorFalha e o resto segue normalmente. Trocar por um broker depois (RabbitMQ etc.)
// só exige reimplementar adicionar/remover/notificar.
export class RecomendacaoEventEmitter implements Publicador {
  private readonly emitter = new EventEmitter();
  private readonly pendentes = new Set<Promise<void>>();
  private readonly listeners = new Map<Observador, (evento: EventoRecomendacao) => void>();

  constructor(private readonly tratadorFalha: TratadorFalha = () => {}) {
    this.emitter.setMaxListeners(100);
  }

  adicionar(observador: Observador): void {
    if (this.listeners.has(observador)) return;
    const listener = (evento: EventoRecomendacao): void => {
      const tarefa = this.executar(evento.nome, observador.nome, () => observador.atualizar(evento));
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

  notificar(evento: EventoRecomendacao): void {
    this.emitter.emit(CANAL, evento);
  }

  // Atalho: adiciona vários observadores de uma vez.
  registrar(...observadores: Observador[]): this {
    for (const observador of observadores) this.adicionar(observador);
    return this;
  }

  // Atalho: monta o evento a partir do nome e do payload e notifica.
  publicar<E extends NomeEvento>(nome: E, payload: MapaEventos[E]): void {
    this.notificar({ nome, payload } as EventoRecomendacao);
  }

  quantidadeObservadores(): number {
    return this.listeners.size;
  }

  // Usado nos testes e no desligamento do servidor.
  async aguardarPendentes(): Promise<void> {
    while (this.pendentes.size > 0) await Promise.allSettled([...this.pendentes]);
  }

  private async executar(evento: NomeEvento, observador: string, rodar: () => void | Promise<void>): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve)); // sai do fluxo de quem publicou
    try {
      await rodar();
    } catch (erro) {
      try {
        this.tratadorFalha(erro, evento, observador);
      } catch {
        // se até o tratador falhar, não há mais o que fazer aqui
      }
    }
  }
}
