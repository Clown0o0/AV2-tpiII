import type { PapelTecnico, Projeto, TipoCaptacao } from '../../domain/entities/Projeto';
import { EVENTOS, type EventoBase, type EventoRecomendacao, type NomeEvento } from '../EventTypes';
import type { Observador } from '../RecomendacaoEventEmitter';
import type { LoggerEstruturado } from './AuditoriaObserver';

export interface NotificacaoTipo {
  tipoCaptacao: TipoCaptacao;
  evento: NomeEvento;
  projetoId: string;
  destinatarioId: string;
  texto: string;
  criadaEm: Date;
}

// Base dos notificadores criados pelas fábricas. Só reage a eventos de projetos do próprio tipo
// e só muda o texto de cada aviso. Notificação SIMULADA: fica em `enviadas` e no log.
export abstract class NotificadorPorTipo implements Observador {
  abstract readonly nome: string;
  private readonly _enviadas: NotificacaoTipo[] = [];

  constructor(
    readonly tipoCaptacao: TipoCaptacao,
    private readonly logger?: LoggerEstruturado,
  ) {}

  get enviadas(): readonly NotificacaoTipo[] {
    return [...this._enviadas];
  }

  atualizar(evento: EventoRecomendacao): void {
    if (!this.doTipo(evento.payload)) return;
    switch (evento.nome) {
      case EVENTOS.RECOMENDACAO_GERADA: {
        const { projeto } = evento.payload;
        this.notificar(EVENTOS.RECOMENDACAO_GERADA, projeto.id, projeto.produtorId, this.textoRecomendacao(projeto));
        return;
      }
      case EVENTOS.MEMBRO_REJEITADO: {
        const { projetoId, ator, papel } = evento.payload;
        this.notificar(EVENTOS.MEMBRO_REJEITADO, projetoId, ator.id, this.textoPapelEmAberto(papel));
        return;
      }
      case EVENTOS.EQUIPE_FINALIZADA: {
        const { projeto, recomendacao } = evento.payload;
        for (const membro of recomendacao.membrosAtivos()) {
          this.notificar(EVENTOS.EQUIPE_FINALIZADA, projeto.id, membro.profissionalId, this.textoEquipeFinalizada(projeto));
        }
        return;
      }
    }
  }

  protected abstract textoRecomendacao(projeto: Projeto): string;
  protected abstract textoPapelEmAberto(papel: PapelTecnico): string;
  protected abstract textoEquipeFinalizada(projeto: Projeto): string;

  private doTipo(payload: EventoBase): boolean {
    const tipo = payload.tipoCaptacao ?? (payload as Partial<{ projeto: Projeto }>).projeto?.tipoCaptacao;
    return tipo === this.tipoCaptacao;
  }

  private notificar(evento: NomeEvento, projetoId: string, destinatarioId: string, texto: string): void {
    const notificacao: NotificacaoTipo = { tipoCaptacao: this.tipoCaptacao, evento, projetoId, destinatarioId, texto, criadaEm: new Date() };
    this._enviadas.push(notificacao);
    this.logger?.info(
      { canal: this.nome, tipoCaptacao: this.tipoCaptacao, evento, projetoId, destinatarioId },
      'notificação por tipo simulada',
    );
  }
}
