import type { Projeto } from '../../domain/entities/Projeto';
import { EVENTOS, type EventoRecomendacao } from '../EventTypes';
import type { Observador } from '../RecomendacaoEventEmitter';
import type { LoggerEstruturado } from './AuditoriaObserver';

export interface EmailSimulado {
  para: string;
  assunto: string;
  corpo: string;
  enviadoEm: Date;
}

// Envio de e-mail SIMULADO: nada sai do processo; as mensagens ficam em `enviados` e no log.
export class EmailObserver implements Observador {
  readonly nome = 'email';
  private readonly _enviados: EmailSimulado[] = [];

  constructor(private readonly logger?: LoggerEstruturado) {}

  get enviados(): readonly EmailSimulado[] {
    return [...this._enviados];
  }

  atualizar(evento: EventoRecomendacao): void {
    switch (evento.nome) {
      case EVENTOS.RECOMENDACAO_GERADA: {
        const { projeto, recomendacao, motivo, profissionaisSugeridos } = evento.payload;
        this.enviar(
          emailProdutor(projeto),
          `Equipe recomendada para "${projeto.titulo}"`,
          `${motivo === 'REAVALIACAO' ? 'Reavaliação concluída. ' : ''}` +
            `${recomendacao.membrosAtivos().length} de ${projeto.papeis.length} papéis possuem sugestão ` +
            `(estratégia ${recomendacao.estrategia}).`,
        );
        for (const profissional of profissionaisSugeridos) {
          const papel = recomendacao.membrosAtivos().find((m) => m.profissionalId === profissional.id)?.papel;
          this.enviarInteresse(profissional.email, profissional.nome, projeto.titulo, papel);
        }
        return;
      }
      case EVENTOS.MEMBRO_SUBSTITUIDO: {
        const { projeto, papel, profissionalNovo } = evento.payload;
        if (profissionalNovo) this.enviarInteresse(profissionalNovo.email, profissionalNovo.nome, projeto.titulo, papel);
        return;
      }
      case EVENTOS.INTERESSE_PRODUTOR: {
        const { projeto, convite, profissional } = evento.payload;
        if (!profissional) return;
        this.enviar(
          profissional.email,
          `Convite para o projeto "${projeto.titulo}"`,
          `Olá, ${profissional.nome}! Um produtor tem interesse em você como ${convite.papel}. ` +
            `Responda ao convite ${convite.id}.`,
        );
        return;
      }
      case EVENTOS.CONVITE_ACEITO: {
        const { projeto, convite, profissional } = evento.payload;
        this.enviar(
          emailProdutor(projeto),
          `Convite aceito: ${convite.papel}`,
          `${profissional?.nome ?? convite.profissionalId} aceitou o convite para "${projeto.titulo}".`,
        );
        return;
      }
      case EVENTOS.CONVITE_RECUSADO: {
        const { projeto, convite, profissional } = evento.payload;
        this.enviar(
          emailProdutor(projeto),
          `Convite recusado: ${convite.papel}`,
          `${profissional?.nome ?? convite.profissionalId} recusou o convite para "${projeto.titulo}". ` +
            'Você pode solicitar a substituição deste papel.',
        );
        return;
      }
      case EVENTOS.EQUIPE_FINALIZADA: {
        const { projeto } = evento.payload;
        this.enviar(emailProdutor(projeto), `Equipe formada para "${projeto.titulo}"`, 'Todos os papéis foram confirmados.');
        return;
      }
    }
  }

  private enviarInteresse(para: string, nome: string, titulo: string, papel: string | undefined): void {
    this.enviar(
      para,
      `Você foi sugerido para o projeto "${titulo}"`,
      `Olá, ${nome}! Um produtor tem interesse em você${papel ? ` como ${papel}` : ''} no projeto "${titulo}". ` +
        'Você receberá um convite se ele confirmar a sugestão.',
    );
  }

  private enviar(para: string, assunto: string, corpo: string): void {
    const email: EmailSimulado = { para, assunto, corpo, enviadoEm: new Date() };
    this._enviados.push(email);
    this.logger?.info({ canal: 'email', para, assunto }, 'e-mail simulado enviado');
  }
}

function emailProdutor(projeto: Projeto): string {
  return projeto.produtorEmail ?? `${projeto.produtorId}@produtores.cinebridge.local`;
}
