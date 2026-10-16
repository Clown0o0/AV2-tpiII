import type { FabricaProjeto } from '../../../src/factories/FabricaProjeto';
import { RegistroFabricas } from '../../../src/factories/RegistroFabricas';
import { OrquestradorPadrao } from '../../../src/orchestration/OrquestradorPadrao';
import { FonteProfissionaisResiliente } from '../../../src/services/FonteProfissionaisResiliente';
import { OrquestradorDeRecomendacao } from '../../../src/services/OrquestradorDeRecomendacao';
import { RegistroEstrategias } from '../../../src/strategies/RegistroEstrategias';
import { criarProjeto, DATA_REFERENCIA, elencoCompleto } from '../../support/fixtures';
import { InMemoryProfissionalRepository } from '../../support/InMemoryRepositories';

function montar() {
  const repositorio = new InMemoryProfissionalRepository(elencoCompleto());
  const criarOrquestrador = jest.fn((fabrica: FabricaProjeto) => new OrquestradorPadrao(fabrica));
  const recomendador = new OrquestradorDeRecomendacao({
    fabricas: RegistroFabricas.padrao(),
    estrategias: RegistroEstrategias.padrao(),
    profissionais: new FonteProfissionaisResiliente(repositorio, { ttlMs: 0, timeoutMs: 100 }),
    criarOrquestrador,
    relogio: () => DATA_REFERENCIA,
  });
  return { repositorio, criarOrquestrador, recomendador };
}

describe('OrquestradorDeRecomendacao', () => {
  it('monta a recomendação inicial com o orquestrador da fábrica do tipo e informa os sugeridos', async () => {
    const { recomendador, criarOrquestrador } = montar();
    const projeto = criarProjeto();
    const { recomendacao, fonte, sugeridos } = await recomendador.recomendarEquipe(projeto);

    expect(criarOrquestrador.mock.calls[0]?.[0].tipo).toBe('FICCAO');
    expect(fonte).toBe('REPOSITORIO');
    expect(recomendacao).toMatchObject({ projetoId: projeto.id, estrategia: 'COSSENO', parcial: false, criadaEm: DATA_REFERENCIA });
    expect(recomendacao.membrosAtivos().map((m) => [m.papel, m.rodada])).toEqual([
      ['DIRETOR', 1],
      ['DIRETOR_FOTOGRAFIA', 1],
      ['EDITOR', 1],
    ]);
    expect(sugeridos.map((p) => p.id).sort()).toEqual(recomendacao.membrosAtivos().map((m) => m.profissionalId).sort());
  });

  it('o aviso da origem dos profissionais vem de uma tabela por origem', async () => {
    const { recomendador, repositorio } = montar();
    repositorio.indisponivel = true;
    const { recomendacao, fonte } = await recomendador.recomendarEquipe(criarProjeto());
    expect(fonte).toBe('INDISPONIVEL');
    expect(recomendacao.avisos.at(-1)).toBe('Repositório de profissionais indisponível (conexão recusada); nenhuma sugestão pôde ser gerada');
  });

  it('recomenda um substituto só para o papel, numa nova rodada, sem repetir quem já foi sugerido', async () => {
    const { recomendador } = montar();
    const projeto = criarProjeto();
    const { recomendacao } = await recomendador.recomendarEquipe(projeto);
    recomendacao.substituir('DIRETOR');

    const { novoMembro, profissionalNovo } = await recomendador.recomendarSubstituto(
      projeto,
      recomendacao,
      'DIRETOR',
      RegistroEstrategias.padrao().obter('COSSENO'),
    );
    expect(novoMembro).toMatchObject({ papel: 'DIRETOR', profissionalId: 'DIRETOR-junior', rodada: 2 });
    expect(profissionalNovo?.id).toBe('DIRETOR-junior');
    expect(recomendacao.parcial).toBe(false);
  });
});
