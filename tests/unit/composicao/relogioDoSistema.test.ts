import { construirApp } from '../../../src/app';
import { agendaAPartirDeHoje, criarProfissional, DIA_MS } from '../../support/fixtures';
import { InMemoryProfissionalRepository } from '../../support/InMemoryRepositories';
import { criarSistemaDeTeste } from '../../support/sistema';

// Só o Date é simulado; os temporizadores continuam reais.
const SO_A_DATA = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

function dataISO(milissegundos: number): string {
  return new Date(milissegundos).toISOString();
}

// Sem relógio injetado, o sistema usa a data do sistema: o fluxo precisa funcionar em qualquer ano.
describe.each(['2031-06-15T12:00:00.000Z', '2040-02-29T23:30:00.000Z'])('com o relógio do sistema em %s', (agora) => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(agora), doNotFake: [...SO_A_DATA] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function montarApp(): ReturnType<typeof construirApp> {
    const profissional = criarProfissional({ especialidades: ['DIRETOR'], disponibilidade: agendaAPartirDeHoje() });
    return construirApp({
      montarServico: () => criarSistemaDeTeste({ profissionais: new InMemoryProfissionalRepository([profissional]) }),
    });
  }

  function corpo(dataEntrega: string): object {
    return {
      titulo: 'Projeto no futuro',
      produtorId: 'produtor-1',
      genero: 'Drama',
      duracaoEstimadaMin: 90,
      orcamentoTotal: 100000,
      dataEntrega,
      tipoCaptacao: 'FICCAO',
      localizacao: 'São Paulo',
      papeis: [{ papel: 'DIRETOR', peso: 1 }],
    };
  }

  it('recomenda com entrega daqui a 90 dias e marca a criação com a data simulada', async () => {
    expect(new Date().toISOString()).toBe(agora);
    const app = montarApp();
    const resposta = await app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpo(dataISO(Date.now() + 90 * DIA_MS)) });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().recomendacao.equipe).toHaveLength(1);
    expect(resposta.json().recomendacao.criadaEm).toBe(agora);
    await app.close();
  });

  it('rejeita entrega no dia anterior ao relógio simulado', async () => {
    const app = montarApp();
    const resposta = await app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpo(dataISO(Date.now() - DIA_MS)) });
    expect(resposta.statusCode).toBe(422);
    await app.close();
  });
});
