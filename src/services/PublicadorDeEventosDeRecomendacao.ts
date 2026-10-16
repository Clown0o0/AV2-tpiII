import type { Convite } from '../domain/entities/Convite';
import type { PapelTecnico, Projeto, ResultadoAlteracao } from '../domain/entities/Projeto';
import type { Profissional } from '../domain/entities/Profissional';
import type { MembroRecomendadoLeitura, Recomendacao } from '../domain/entities/Recomendacao';
import type { OrigemDosProfissionais } from '../domain/ports/FonteDeProfissionais';
import { EVENTOS, type Ator, type EventoBase } from '../events/EventTypes';
import type { PublicadorEventos } from '../events/PublicadorEventos';
import type { Relogio } from './contratos';

export type MotivoDaRecomendacao = 'INICIAL' | 'REAVALIACAO';

export interface EventosDeRecomendacao {
  recomendacaoGerada(
    projeto: Projeto,
    recomendacao: Recomendacao,
    motivo: MotivoDaRecomendacao,
    fonte: OrigemDosProfissionais,
    sugeridos: readonly Profissional[],
  ): void;
  interesseDoProdutor(projeto: Projeto, convite: Convite, profissional: Profissional | null): void;
  membroRejeitado(projeto: Projeto, recomendacaoId: string, papel: PapelTecnico, profissionalId: string): void;
  membroSubstituido(projeto: Projeto, recomendacao: Recomendacao, substituicao: DadosDaSubstituicao): void;
  conviteRespondido(projeto: Projeto, convite: Convite, aceito: boolean, profissional: Profissional | null): void;
  projetoAlterado(projeto: Projeto, alteracao: ResultadoAlteracao, reavaliada: boolean): void;
  equipeFinalizada(projeto: Projeto, recomendacao: Recomendacao): void;
}

export interface DadosDaSubstituicao {
  papel: PapelTecnico;
  anteriorId: string | null;
  novoMembro: MembroRecomendadoLeitura | null;
  profissionalNovo: Profissional | null;
}

const SISTEMA: Ator = { tipo: 'SISTEMA', id: 'cinebridge-recomendacao' };

// Monta o EventoBase (ator, horário, projeto e tipo) de cada evento de domínio e de integração.
export class PublicadorDeEventosDeRecomendacao implements EventosDeRecomendacao {
  constructor(
    private readonly eventos: PublicadorEventos,
    private readonly relogio: Relogio,
  ) {}

  recomendacaoGerada(
    projeto: Projeto,
    recomendacao: Recomendacao,
    motivo: MotivoDaRecomendacao,
    fonte: OrigemDosProfissionais,
    sugeridos: readonly Profissional[],
  ): void {
    this.eventos.publicar(EVENTOS.RECOMENDACAO_GERADA, {
      ...this.peloProdutor(projeto),
      projeto,
      recomendacao,
      motivo,
      fonteProfissionais: fonte,
      profissionaisSugeridos: sugeridos,
    });
  }

  interesseDoProdutor(projeto: Projeto, convite: Convite, profissional: Profissional | null): void {
    this.eventos.publicar(EVENTOS.INTERESSE_PRODUTOR, { ...this.peloProdutor(projeto), projeto, convite, profissional });
  }

  membroRejeitado(projeto: Projeto, recomendacaoId: string, papel: PapelTecnico, profissionalId: string): void {
    this.eventos.publicar(EVENTOS.MEMBRO_REJEITADO, { ...this.peloProdutor(projeto), recomendacaoId, papel, profissionalId });
  }

  membroSubstituido(projeto: Projeto, recomendacao: Recomendacao, substituicao: DadosDaSubstituicao): void {
    this.eventos.publicar(EVENTOS.MEMBRO_SUBSTITUIDO, {
      ...this.peloProdutor(projeto),
      projeto,
      recomendacao,
      papel: substituicao.papel,
      anteriorId: substituicao.anteriorId,
      novoId: substituicao.novoMembro?.profissionalId ?? null,
      profissionalNovo: substituicao.profissionalNovo,
    });
  }

  conviteRespondido(projeto: Projeto, convite: Convite, aceito: boolean, profissional: Profissional | null): void {
    const evento = aceito ? EVENTOS.CONVITE_ACEITO : EVENTOS.CONVITE_RECUSADO;
    const ator: Ator = { tipo: 'PROFISSIONAL', id: convite.profissionalId };
    this.eventos.publicar(evento, { ...this.base(projeto, ator), projeto, convite, profissional });
  }

  projetoAlterado(projeto: Projeto, alteracao: ResultadoAlteracao, reavaliada: boolean): void {
    this.eventos.publicar(EVENTOS.PROJETO_ALTERADO, { ...this.peloProdutor(projeto), projeto, alteracao, reavaliada });
  }

  equipeFinalizada(projeto: Projeto, recomendacao: Recomendacao): void {
    this.eventos.publicar(EVENTOS.EQUIPE_FINALIZADA, { ...this.base(projeto, SISTEMA), projeto, recomendacao });
    this.iniciarGerenciamentoDoProjeto(projeto, recomendacao);
    this.iniciarFinanceiro(projeto, recomendacao);
  }

  // Os eventos de integração só são emitidos em memória; nenhum outro serviço é chamado de verdade.
  private iniciarGerenciamentoDoProjeto(projeto: Projeto, recomendacao: Recomendacao): void {
    this.eventos.publicar(EVENTOS.INTEGRACAO_GERENCIAMENTO_PROJETOS, {
      ...this.base(projeto, SISTEMA),
      recomendacaoId: recomendacao.id,
      dataEntrega: projeto.dataEntrega,
      equipe: recomendacao.membrosAtivos().map((m) => ({ papel: m.papel, profissionalId: m.profissionalId })),
    });
  }

  private iniciarFinanceiro(projeto: Projeto, recomendacao: Recomendacao): void {
    this.eventos.publicar(EVENTOS.INTEGRACAO_FINANCEIRO, {
      ...this.base(projeto, SISTEMA),
      recomendacaoId: recomendacao.id,
      orcamentoTotal: projeto.orcamentoTotal,
      custoEquipe: recomendacao.custoTotal(),
      pagamentos: recomendacao.membrosAtivos().map((m) => ({ profissionalId: m.profissionalId, papel: m.papel, valor: m.custo })),
    });
  }

  private peloProdutor(projeto: Projeto): EventoBase {
    return this.base(projeto, { tipo: 'PRODUTOR', id: projeto.produtorId });
  }

  private base(projeto: Projeto, ator: Ator): EventoBase {
    return { ator, ocorridoEm: this.relogio(), projetoId: projeto.id, tipoCaptacao: projeto.tipoCaptacao };
  }
}
