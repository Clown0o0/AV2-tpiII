import type { Observador } from '../../events/RecomendacaoEventEmitter';

// Ficção mantém o comportamento da ATVI: só os observadores genéricos (e-mail, mensagem interna,
// auditoria) avisam; não há notificação extra por tipo.
export class NotificadorFiccao implements Observador {
  readonly nome = 'notificador-ficcao';

  registrar(): void {}
}
