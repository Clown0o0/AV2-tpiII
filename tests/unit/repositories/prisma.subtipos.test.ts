import type { PrismaClient } from '@prisma/client';
import { ErroValidacao } from '../../../src/domain/errors';
import { Projeto } from '../../../src/domain/entities/Projeto';
import { ProjetoAnimacao } from '../../../src/domain/entities/ProjetoAnimacao';
import { RegistroFabricas } from '../../../src/factories/RegistroFabricas';
import { FabricaFiccao } from '../../../src/factories/ficcao/FabricaFiccao';
import { PrismaProjetoRepository } from '../../../src/repositories/PrismaProjetoRepository';
import { dadosProjeto, OPCOES_FABRICA } from '../../support/fixtures';

function prismaFalso() {
  const mock = {
    projeto: { upsert: jest.fn(), findUnique: jest.fn() },
    projetoPapel: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((fn: (tx: typeof mock) => Promise<unknown>) => fn(mock));
  return { mock, prisma: mock as unknown as PrismaClient };
}

// O que o banco devolveria para o projeto gravado pelo upsert.
function lidoDoBanco(mock: ReturnType<typeof prismaFalso>['mock'], projeto: Projeto) {
  return { ...mock.projeto.upsert.mock.calls[0][0].create, orcamentoTotal: String(projeto.orcamentoTotal), papeis: [{ papel: 'DIRETOR', peso: 1, competenciasDesejadas: null }] };
}

describe('PrismaProjetoRepository com tipos de projeto', () => {
  it('grava os detalhes em JSON e reconstrói o subtipo pela fábrica do tipo', async () => {
    const { mock, prisma } = prismaFalso();
    const repo = new PrismaProjetoRepository(prisma, RegistroFabricas.padrao());
    const projeto = new ProjetoAnimacao(dadosProjeto({ tipoCaptacao: 'ANIMACAO', detalhes: { tecnica: 'STOP_MOTION', softwares: ['Dragonframe'] } }));

    await repo.salvar(projeto);
    expect(mock.projeto.upsert.mock.calls[0][0].create).toMatchObject({
      tipoCaptacao: 'ANIMACAO',
      detalhes: { tecnica: 'STOP_MOTION', softwares: ['Dragonframe'], quadrosPorSegundo: 24 },
    });

    mock.projeto.findUnique.mockResolvedValueOnce(lidoDoBanco(mock, projeto));
    const lido = await repo.buscarPorId(projeto.id);
    expect(lido).toBeInstanceOf(ProjetoAnimacao);
    expect(lido?.id).toBe(projeto.id);
    expect(lido?.detalhes).toEqual(projeto.detalhes);
  });

  it('ficção grava detalhes vazios e um tipo sem fábrica no registro é recusado na leitura', async () => {
    const { mock, prisma } = prismaFalso();
    const repo = new PrismaProjetoRepository(prisma, new RegistroFabricas([new FabricaFiccao(OPCOES_FABRICA)]));
    const ficcao = new Projeto(dadosProjeto());
    await repo.salvar(ficcao);
    expect(mock.projeto.upsert.mock.calls[0][0].create.detalhes).toBeUndefined();

    mock.projeto.findUnique.mockResolvedValueOnce({ ...lidoDoBanco(mock, ficcao), tipoCaptacao: 'DOCUMENTARIO', detalhes: { tema: 'x' } });
    await expect(repo.buscarPorId(ficcao.id)).rejects.toThrow(ErroValidacao);
  });
});
