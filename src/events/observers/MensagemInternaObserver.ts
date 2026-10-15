import { EVENTOS, type EventoRecomendacao } from '../EventTypes';
import type { Observador } from '../RecomendacaoEventEmitter';
import type { LoggerEstruturado } from './AuditoriaObserver';

export interface MensagemInterna {
  destinatarioId: string;
  texto: string;
  referencia: string;
  criadaEm: Date;
}

// Mensagens da plataforma (simuladas em memória): caixa de entrada por destinatário.
export class MensagemInternaObserver implements Observador {
  readonly nome = 'mensagem-interna';
  private readonly caixas = new Map<string, MensagemInterna[]>();

  constructor(private readonly logger?: LoggerEstruturado) {}

  caixaDe(destinatarioId: string): readonly MensagemInterna[] {
    return this.caixas.get(destinatarioId) ?? [];
  }

  atualizar(evento: EventoRecomendacao): void {
    switch (evento.nome) {
      case EVENTOS.RECOMENDACAO_GERADA: {
        const { projeto, recomendacao, profissionaisSugeridos } = evento.payload;
        this.entregar(
          projeto.produtorId,
          `Nova recomendação de equipe disponível para "${projeto.titulo}"` +
            (recomendacao.parcial ? ' (parcial: alguns papéis ficaram sem sugestão)' : ''),
          recomendacao.id,
        );
        for (const profissional of profissionaisSugeridos) {
          this.entregar(profissional.id, `Um produtor tem interesse em você para "${projeto.titulo}"`, recomendacao.id);
        }
        return;
      }
      case EVENTOS.MEMBRO_SUBSTITUIDO: {
        const { projeto, papel, novoId, profissionalNovo, recomendacao } = evento.payload;
        this.entregar(
          projeto.produtorId,
          novoId ? `Nova sugestão para o papel ${papel}` : `Não encontramos substituto para o papel ${papel}`,
          recomendacao.id,
        );
        if (profissionalNovo) {
          this.entregar(profissionalNovo.id, `Um produtor tem interesse em você para "${projeto.titulo}" (${papel})`, recomendacao.id);
        }
        return;
      }
      case EVENTOS.INTERESSE_PRODUTOR: {
        const { projeto, convite } = evento.payload;
        this.entregar(convite.profissionalId, `Você recebeu um convite para "${projeto.titulo}" (${convite.papel})`, convite.id);
        return;
      }
      case EVENTOS.CONVITE_ACEITO: {
        const { projeto, convite } = evento.payload;
        this.entregar(projeto.produtorId, `Convite para ${convite.papel} foi aceito`, convite.id);
        return;
      }
      case EVENTOS.CONVITE_RECUSADO: {
        const { projeto, convite } = evento.payload;
        this.entregar(projeto.produtorId, `Convite para ${convite.papel} foi recusado`, convite.id);
        return;
      }
      case EVENTOS.EQUIPE_FINALIZADA: {
        const { projeto, recomendacao } = evento.payload;
        for (const membro of recomendacao.membrosAtivos()) {
          this.entregar(membro.profissionalId, `A equipe de "${projeto.titulo}" está completa. Bem-vindo(a)!`, recomendacao.id);
        }
        return;
      }
    }
  }

  private entregar(destinatarioId: string, texto: string, referencia: string): void {
    const mensagem: MensagemInterna = { destinatarioId, texto, referencia, criadaEm: new Date() };
    const caixa = this.caixas.get(destinatarioId) ?? [];
    caixa.push(mensagem);
    this.caixas.set(destinatarioId, caixa);
    this.logger?.info({ canal: 'mensagem-interna', destinatarioId, referencia }, 'mensagem interna entregue');
  }
}
