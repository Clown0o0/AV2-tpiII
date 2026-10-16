import { Convite } from '../../../src/domain/entities/Convite';
import { MembroRecomendado, Recomendacao } from '../../../src/domain/entities/Recomendacao';
import { EVENTOS, type MapaEventos, type NomeEvento } from '../../../src/events/EventTypes';
import type { PublicadorEventos } from '../../../src/events/PublicadorEventos';
import { PublicadorDeEventosDeRecomendacao } from '../../../src/services/PublicadorDeEventosDeRecomendacao';
import { criarProfissional, criarProjeto, DATA_REFERENCIA } from '../../support/fixtures';

class EventosGravados implements PublicadorEventos {
  readonly publicados: Array<{ nome: NomeEvento; payload: unknown }> = [];

  publicar<E extends NomeEvento>(nome: E, payload: MapaEventos[E]): void {
    this.publicados.push({ nome, payload });
  }
}

function montar() {
  const gravados = new EventosGravados();
  const projeto = criarProjeto();
  const membro = new MembroRecomendado({ papel: 'DIRETOR', profissionalId: 'p1', score: 1, custo: 1000, rodada: 1 });
  const recomendacao = new Recomendacao({ projetoId: projeto.id, estrategia: 'COSSENO', membros: [membro] });
  const convite = new Convite({ recomendacaoId: recomendacao.id, projetoId: projeto.id, profissionalId: 'p1', papel: 'DIRETOR' });
  const eventos = new PublicadorDeEventosDeRecomendacao(gravados, () => DATA_REFERENCIA);
  return { gravados, eventos, projeto, recomendacao, convite, membro };
}

describe('PublicadorDeEventosDeRecomendacao', () => {
  it('monta o EventoBase com o produtor como ator, o horário do relógio e o tipo do projeto', () => {
    const { gravados, eventos, projeto, recomendacao } = montar();
    eventos.recomendacaoGerada(projeto, recomendacao, 'INICIAL', 'CACHE', []);
    expect(gravados.publicados).toEqual([
      {
        nome: EVENTOS.RECOMENDACAO_GERADA,
        payload: {
          ator: { tipo: 'PRODUTOR', id: projeto.produtorId },
          ocorridoEm: DATA_REFERENCIA,
          projetoId: projeto.id,
          tipoCaptacao: 'FICCAO',
          projeto,
          recomendacao,
          motivo: 'INICIAL',
          fonteProfissionais: 'CACHE',
          profissionaisSugeridos: [],
        },
      },
    ]);
  });

  it('a resposta de convite tem o profissional como ator e escolhe o evento pelo aceite', () => {
    const { gravados, eventos, projeto, convite } = montar();
    const profissional = criarProfissional({ id: 'p1' });
    eventos.conviteRespondido(projeto, convite, true, profissional);
    eventos.conviteRespondido(projeto, convite, false, null);
    expect(gravados.publicados.map((p) => p.nome)).toEqual([EVENTOS.CONVITE_ACEITO, EVENTOS.CONVITE_RECUSADO]);
    expect(gravados.publicados[0]?.payload).toMatchObject({ ator: { tipo: 'PROFISSIONAL', id: 'p1' }, profissional });
  });

  it('equipe finalizada publica também as duas integrações, com o sistema como ator', () => {
    const { gravados, eventos, projeto, recomendacao } = montar();
    eventos.equipeFinalizada(projeto, recomendacao);
    expect(gravados.publicados.map((p) => p.nome)).toEqual([
      EVENTOS.EQUIPE_FINALIZADA,
      EVENTOS.INTEGRACAO_GERENCIAMENTO_PROJETOS,
      EVENTOS.INTEGRACAO_FINANCEIRO,
    ]);
    expect(gravados.publicados[2]?.payload).toMatchObject({
      ator: { tipo: 'SISTEMA', id: 'cinebridge-recomendacao' },
      custoEquipe: 1000,
      pagamentos: [{ profissionalId: 'p1', papel: 'DIRETOR', valor: 1000 }],
    });
  });

  it('demais eventos levam os dados de cada caso de uso', () => {
    const { gravados, eventos, projeto, recomendacao, convite, membro } = montar();
    eventos.interesseDoProdutor(projeto, convite, null);
    eventos.membroRejeitado(projeto, recomendacao.id, 'DIRETOR', 'p1');
    eventos.membroSubstituido(projeto, recomendacao, { papel: 'DIRETOR', anteriorId: 'p0', novoMembro: membro, profissionalNovo: null });
    eventos.projetoAlterado(projeto, { variacaoOrcamento: 0, variacaoPrazoDias: 0, estrategiaAlterada: false }, false);
    expect(gravados.publicados.map((p) => p.nome)).toEqual([
      EVENTOS.INTERESSE_PRODUTOR,
      EVENTOS.MEMBRO_REJEITADO,
      EVENTOS.MEMBRO_SUBSTITUIDO,
      EVENTOS.PROJETO_ALTERADO,
    ]);
    expect(gravados.publicados[2]?.payload).toMatchObject({ anteriorId: 'p0', novoId: 'p1', profissionalNovo: null });
  });
});
