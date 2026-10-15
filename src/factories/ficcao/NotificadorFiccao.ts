import type { Observador } from '../../events/RecomendacaoEventEmitter';

// Ficção não tem notificação própria do tipo: só os observadores genéricos (e-mail,
// mensagem interna, auditoria) avisam.
export class NotificadorFiccao implements Observador {
  readonly nome = 'notificador-ficcao';

  atualizar(): void {}
}
