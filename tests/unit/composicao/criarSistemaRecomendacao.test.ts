import { criarSistemaRecomendacao } from '../../../src/composicao/criarSistemaRecomendacao';
import { RecomendacaoEventEmitter } from '../../../src/events/RecomendacaoEventEmitter';
import type { FabricaProjeto } from '../../../src/factories/FabricaProjeto';
import { OrquestradorPadrao } from '../../../src/orchestration/OrquestradorPadrao';
import { RegistroPrototipos } from '../../../src/prototypes/RegistroPrototipos';
import { CossenoStrategy } from '../../../src/strategies/CossenoStrategy';
import { RegistroEstrategias } from '../../../src/strategies/RegistroEstrategias';
import { dadosProjeto, DATA_REFERENCIA, elencoCompleto } from '../../support/fixtures';
import { InMemoryProfissionalRepository, InMemoryProjetoRepository } from '../../support/InMemoryRepositories';

function infraestrutura() {
  return {
    profissionais: new InMemoryProfissionalRepository(elencoCompleto()),
    projetos: new InMemoryProjetoRepository(),
    eventos: new RecomendacaoEventEmitter(),
  };
}

describe('criarSistemaRecomendacao (raiz de composição)', () => {
  it('sem opções, usa os registros padrão', () => {
    const sistema = criarSistemaRecomendacao(infraestrutura());
    expect(sistema.tiposCaptacao()).toEqual(['DOCUMENTARIO', 'FICCAO', 'ANIMACAO', 'PUBLICITARIO']);
    expect(sistema.tiposEstrategia()).toEqual(['COSSENO', 'FILTRAGEM_COLABORATIVA', 'ORCAMENTO_REDUZIDO']);
    expect(sistema.modelos()).toEqual(['ficcao', 'documentario', 'animacao', 'publicitario']);
  });

  it('usa as implementações injetadas no lugar dos padrões', async () => {
    const criarOrquestrador = jest.fn((fabrica: FabricaProjeto) => new OrquestradorPadrao(fabrica));
    const sistema = criarSistemaRecomendacao({
      ...infraestrutura(),
      estrategias: new RegistroEstrategias([new CossenoStrategy()]),
      prototipos: new RegistroPrototipos(),
      criarOrquestrador,
      relogio: () => DATA_REFERENCIA,
    });
    expect(sistema.tiposEstrategia()).toEqual(['COSSENO']);
    expect(sistema.modelos()).toEqual([]);
    const { recomendacao } = await sistema.recomendar(dadosProjeto());
    expect(criarOrquestrador).toHaveBeenCalled();
    expect(recomendacao.criadaEm).toBe(DATA_REFERENCIA);
  });
});
