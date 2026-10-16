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

export interface MensagemInterna {
  destinatarioId: string;
  texto: string;
  referencia: string;
  criadaEm: Date;
}

// Mensagens da plataforma (simuladas em memória): caixa de entrada por destinatário.
export class MensagemInternaObservador implements Observador {
  readonly nome = 'mensagem-interna';
  private readonly caixas = new Map<string, MensagemInterna[]>();

  constructor(private readonly logger?: LoggerEstruturado) {}

  caixaDe(destinatarioId: string): readonly MensagemInterna[] {
    return this.caixas.get(destinatarioId) ?? [];
  }

  atualizar(evento: EventoRecomendacao): void {
    switch (evento.nome) {
      case EVENTOS.RECOMENDACAO_GERADA:
        return this.avisarRecomendacaoGerada(evento.payload);
      case EVENTOS.MEMBRO_SUBSTITUIDO:
        return this.avisarSubstituicao(evento.payload);
      case EVENTOS.INTERESSE_PRODUTOR:
        return this.avisarConvite(evento.payload);
      case EVENTOS.CONVITE_ACEITO:
        return this.avisarRespostaAoProdutor(evento.payload, 'aceito');
      case EVENTOS.CONVITE_RECUSADO:
        return this.avisarRespostaAoProdutor(evento.payload, 'recusado');
      case EVENTOS.EQUIPE_FINALIZADA:
        return this.darBoasVindasAEquipe(evento.payload);
    }
  }

  private avisarRecomendacaoGerada({ projeto, recomendacao, profissionaisSugeridos }: RecomendacaoGerada): void {
    const parcial = recomendacao.parcial ? ' (parcial: alguns papéis ficaram sem sugestão)' : '';
    this.entregar(projeto.produtorId, `Nova recomendação de equipe disponível para "${projeto.titulo}"${parcial}`, recomendacao.id);
    for (const profissional of profissionaisSugeridos) {
      this.entregar(profissional.id, `Um produtor tem interesse em você para "${projeto.titulo}"`, recomendacao.id);
    }
  }

  private avisarSubstituicao({ projeto, papel, novoId, profissionalNovo, recomendacao }: MembroSubstituido): void {
    const texto = novoId ? `Nova sugestão para o papel ${papel}` : `Não encontramos substituto para o papel ${papel}`;
    this.entregar(projeto.produtorId, texto, recomendacao.id);
    if (profissionalNovo) {
      this.entregar(profissionalNovo.id, `Um produtor tem interesse em você para "${projeto.titulo}" (${papel})`, recomendacao.id);
    }
  }

  private avisarConvite({ projeto, convite }: EventoConvite): void {
    this.entregar(convite.profissionalId, `Você recebeu um convite para "${projeto.titulo}" (${convite.papel})`, convite.id);
  }

  private avisarRespostaAoProdutor({ projeto, convite }: EventoConvite, resposta: 'aceito' | 'recusado'): void {
    this.entregar(projeto.produtorId, `Convite para ${convite.papel} foi ${resposta}`, convite.id);
  }

  private darBoasVindasAEquipe({ projeto, recomendacao }: EquipeFinalizada): void {
    for (const membro of recomendacao.membrosAtivos()) {
      this.entregar(membro.profissionalId, `A equipe de "${projeto.titulo}" está completa. Bem-vindo(a)!`, recomendacao.id);
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
