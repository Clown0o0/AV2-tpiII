import type { Projeto } from '../../domain/entities/Projeto';
import {
  EVENTOS,
  type EquipeFinalizada,
  type EventoConvite,
  type EventoRecomendacao,
  type MembroSubstituido,
  type RecomendacaoGerada,
} from '../EventTypes';
import type { Observador } from '../RecomendacaoEventEmitter';
import type { LoggerEstruturado } from './AuditoriaObservador';

export interface EmailSimulado {
  para: string;
  assunto: string;
  corpo: string;
  enviadoEm: Date;
}

// Envio de e-mail SIMULADO: nada sai do processo; as mensagens ficam em `enviados` e no log.
export class EmailObservador implements Observador {
  readonly nome = 'email';
  private readonly _enviados: EmailSimulado[] = [];

  constructor(private readonly logger?: LoggerEstruturado) {}

  get enviados(): readonly EmailSimulado[] {
    return [...this._enviados];
  }

  atualizar(evento: EventoRecomendacao): void {
    switch (evento.nome) {
      case EVENTOS.RECOMENDACAO_GERADA:
        return this.avisarRecomendacaoGerada(evento.payload);
      case EVENTOS.MEMBRO_SUBSTITUIDO:
        return this.avisarSubstituto(evento.payload);
      case EVENTOS.INTERESSE_PRODUTOR:
        return this.enviarConvite(evento.payload);
      case EVENTOS.CONVITE_ACEITO:
        return this.avisarConviteAceito(evento.payload);
      case EVENTOS.CONVITE_RECUSADO:
        return this.avisarConviteRecusado(evento.payload);
      case EVENTOS.EQUIPE_FINALIZADA:
        return this.avisarEquipeFormada(evento.payload);
    }
  }

  private avisarRecomendacaoGerada({ projeto, recomendacao, motivo, profissionaisSugeridos }: RecomendacaoGerada): void {
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
  }

  private avisarSubstituto({ projeto, papel, profissionalNovo }: MembroSubstituido): void {
    if (profissionalNovo) this.enviarInteresse(profissionalNovo.email, profissionalNovo.nome, projeto.titulo, papel);
  }

  private enviarConvite({ projeto, convite, profissional }: EventoConvite): void {
    if (!profissional) return;
    this.enviar(
      profissional.email,
      `Convite para o projeto "${projeto.titulo}"`,
      `Olá, ${profissional.nome}! Um produtor tem interesse em você como ${convite.papel}. ` +
        `Responda ao convite ${convite.id}.`,
    );
  }

  private avisarConviteAceito({ projeto, convite, profissional }: EventoConvite): void {
    this.enviar(
      emailProdutor(projeto),
      `Convite aceito: ${convite.papel}`,
      `${profissional?.nome ?? convite.profissionalId} aceitou o convite para "${projeto.titulo}".`,
    );
  }

  private avisarConviteRecusado({ projeto, convite, profissional }: EventoConvite): void {
    this.enviar(
      emailProdutor(projeto),
      `Convite recusado: ${convite.papel}`,
      `${profissional?.nome ?? convite.profissionalId} recusou o convite para "${projeto.titulo}". ` +
        'Você pode solicitar a substituição deste papel.',
    );
  }

  private avisarEquipeFormada({ projeto }: EquipeFinalizada): void {
    this.enviar(emailProdutor(projeto), `Equipe formada para "${projeto.titulo}"`, 'Todos os papéis foram confirmados.');
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
