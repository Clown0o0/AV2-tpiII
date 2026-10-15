import type { PapelTecnico, Projeto, TipoCaptacao } from '../../domain/entities/Projeto';
import { EVENTOS, type EventoBase, type NomeEvento } from '../EventTypes';
import type { Observador, RecomendacaoEventEmitter } from '../RecomendacaoEventEmitter';
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
  readonly enviadas: NotificacaoTipo[] = [];

  constructor(
    readonly tipoCaptacao: TipoCaptacao,
    private readonly logger?: LoggerEstruturado,
  ) {}

  registrar(subject: RecomendacaoEventEmitter): void {
    subject.inscrever(
      EVENTOS.RECOMENDACAO_GERADA,
      this.nome,
      this.doTipo(({ projeto }) =>
        this.notificar(EVENTOS.RECOMENDACAO_GERADA, projeto.id, projeto.produtorId, this.textoRecomendacao(projeto)),
      ),
    );
    subject.inscrever(
      EVENTOS.MEMBRO_REJEITADO,
      this.nome,
      this.doTipo(({ projetoId, ator, papel }) =>
        this.notificar(EVENTOS.MEMBRO_REJEITADO, projetoId, ator.id, this.textoPapelEmAberto(papel)),
      ),
    );
    subject.inscrever(
      EVENTOS.EQUIPE_FINALIZADA,
      this.nome,
      this.doTipo(({ projeto, recomendacao }) => {
        for (const membro of recomendacao.membrosAtivos()) {
          this.notificar(EVENTOS.EQUIPE_FINALIZADA, projeto.id, membro.profissionalId, this.textoEquipeFinalizada(projeto));
        }
      }),
    );
  }

  protected abstract textoRecomendacao(projeto: Projeto): string;
  protected abstract textoPapelEmAberto(papel: PapelTecnico): string;
  protected abstract textoEquipeFinalizada(projeto: Projeto): string;

  private doTipo<P extends EventoBase>(handler: (payload: P) => void): (payload: P) => void {
    return (payload) => {
      const tipo = payload.tipoCaptacao ?? (payload as Partial<{ projeto: Projeto }>).projeto?.tipoCaptacao;
      if (tipo === this.tipoCaptacao) handler(payload);
    };
  }

  private notificar(evento: NomeEvento, projetoId: string, destinatarioId: string, texto: string): void {
    const notificacao: NotificacaoTipo = { tipoCaptacao: this.tipoCaptacao, evento, projetoId, destinatarioId, texto, criadaEm: new Date() };
    this.enviadas.push(notificacao);
    this.logger?.info(
      { canal: this.nome, tipoCaptacao: this.tipoCaptacao, evento, projetoId, destinatarioId },
      'notificação por tipo simulada',
    );
  }
}
