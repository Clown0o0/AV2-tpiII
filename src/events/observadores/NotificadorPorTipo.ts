import type { PapelTecnico, Projeto, TipoCaptacao } from '../../domain/entities/Projeto';
import {
  EVENTOS,
  type EquipeFinalizada,
  type EventoRecomendacao,
  type MembroRejeitado,
  type NomeEvento,
  type RecomendacaoGerada,
} from '../EventTypes';
import type { Observador } from '../RecomendacaoEventEmitter';
import type { LoggerEstruturado } from './AuditoriaObservador';

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
    if (!this.doTipo(evento)) return;
    switch (evento.nome) {
      case EVENTOS.RECOMENDACAO_GERADA:
        return this.avisarRecomendacao(evento.payload);
      case EVENTOS.MEMBRO_REJEITADO:
        return this.avisarPapelEmAberto(evento.payload);
      case EVENTOS.EQUIPE_FINALIZADA:
        return this.avisarEquipeFinalizada(evento.payload);
    }
  }

  private avisarRecomendacao({ projeto }: RecomendacaoGerada): void {
    this.notificar(EVENTOS.RECOMENDACAO_GERADA, projeto.id, projeto.produtorId, this.textoRecomendacao(projeto));
  }

  private avisarPapelEmAberto({ projetoId, ator, papel }: MembroRejeitado): void {
    this.notificar(EVENTOS.MEMBRO_REJEITADO, projetoId, ator.id, this.textoPapelEmAberto(papel));
  }

  private avisarEquipeFinalizada({ projeto, recomendacao }: EquipeFinalizada): void {
    for (const membro of recomendacao.membrosAtivos()) {
      this.notificar(EVENTOS.EQUIPE_FINALIZADA, projeto.id, membro.profissionalId, this.textoEquipeFinalizada(projeto));
    }
  }

  protected abstract textoRecomendacao(projeto: Projeto): string;
  protected abstract textoPapelEmAberto(papel: PapelTecnico): string;
  protected abstract textoEquipeFinalizada(projeto: Projeto): string;

  private doTipo({ payload }: EventoRecomendacao): boolean {
    const tipo = payload.tipoCaptacao ?? ('projeto' in payload ? payload.projeto.tipoCaptacao : undefined);
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
