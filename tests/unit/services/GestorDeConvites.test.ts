import { MembroRecomendado, Recomendacao } from '../../../src/domain/entities/Recomendacao';
import { ErroEstadoInvalido, ErroNaoEncontrado } from '../../../src/domain/errors';
import { GestorDeConvites } from '../../../src/services/GestorDeConvites';
import { DATA_REFERENCIA } from '../../support/fixtures';
import { InMemoryProjetoRepository } from '../../support/InMemoryRepositories';

function montar() {
  const repositorio = new InMemoryProjetoRepository();
  const gestor = new GestorDeConvites(repositorio, () => DATA_REFERENCIA);
  const recomendacao = new Recomendacao({
    projetoId: 'proj',
    estrategia: 'COSSENO',
    membros: [
      new MembroRecomendado({ papel: 'DIRETOR', profissionalId: 'dir', score: 1, custo: 1, rodada: 1 }),
      new MembroRecomendado({ papel: 'EDITOR', profissionalId: 'ed', score: 1, custo: 1, rodada: 1 }),
    ],
  });
  return { repositorio, gestor, recomendacao };
}

describe('GestorDeConvites', () => {
  it('cria e salva o convite do membro, com a data do relógio', async () => {
    const { repositorio, gestor, recomendacao } = montar();
    const convite = await gestor.criar(recomendacao.id, 'proj', recomendacao.convidar('DIRETOR'));
    expect(convite).toMatchObject({ profissionalId: 'dir', papel: 'DIRETOR', status: 'PENDENTE', criadoEm: DATA_REFERENCIA });
    expect(repositorio.convites.get(convite.id)).toBe(convite);
    expect(await gestor.listar(recomendacao.id)).toEqual([convite]);
  });

  it('obter lança ErroNaoEncontrado para convite inexistente', async () => {
    await expect(montar().gestor.obter('x')).rejects.toThrow(ErroNaoEncontrado);
  });

  it('cancela os pendentes de um membro ou de toda a recomendação', async () => {
    const { gestor, recomendacao } = montar();
    const doDiretor = await gestor.criar(recomendacao.id, 'proj', recomendacao.convidar('DIRETOR'));
    const doEditor = await gestor.criar(recomendacao.id, 'proj', recomendacao.convidar('EDITOR'));
    await gestor.cancelarPendentes(recomendacao.id, recomendacao.rejeitar('DIRETOR'));
    expect([doDiretor.status, doEditor.status]).toEqual(['CANCELADO', 'PENDENTE']);
    await gestor.cancelarPendentes(recomendacao.id);
    expect(doEditor.status).toBe('CANCELADO');
  });

  it('responder atualiza o convite e o membro; convite de membro que não está mais ativo é recusado', async () => {
    const { gestor, recomendacao } = montar();
    const convite = await gestor.criar(recomendacao.id, 'proj', recomendacao.convidar('DIRETOR'));
    await gestor.responder(convite, recomendacao, true);
    expect(convite.status).toBe('ACEITO');
    expect(recomendacao.membroAtivo('DIRETOR')?.status).toBe('CONFIRMADO');

    const doEditor = await gestor.criar(recomendacao.id, 'proj', recomendacao.convidar('EDITOR'));
    recomendacao.substituir('EDITOR');
    await expect(gestor.responder(doEditor, recomendacao, true)).rejects.toThrow(ErroEstadoInvalido);
  });
});
