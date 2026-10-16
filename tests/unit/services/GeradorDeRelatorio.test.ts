import { ProjetoAnimacao } from '../../../src/domain/entities/ProjetoAnimacao';
import { MembroRecomendado, Recomendacao } from '../../../src/domain/entities/Recomendacao';
import type { FonteDeProfissionais } from '../../../src/domain/ports/FonteDeProfissionais';
import { FabricaAnimacao } from '../../../src/factories/animacao/FabricaAnimacao';
import { GeradorDeRelatorio } from '../../../src/services/GeradorDeRelatorio';
import { CompatibilidadeEquipeVisitor } from '../../../src/visitors/CompatibilidadeEquipeVisitor';
import { criarProfissional, dadosProjeto, DATA_REFERENCIA, OPCOES_FABRICA } from '../../support/fixtures';

describe('GeradorDeRelatorio', () => {
  it('roda o relatório e o validador da fábrica e a compatibilidade injetada sobre os membros ativos', async () => {
    const diretor = criarProfissional({ id: 'dir' });
    const buscarPorIds = jest.fn(async () => ({ profissionais: [diretor], fonte: 'REPOSITORIO' as const }));
    const fonte: FonteDeProfissionais = { buscarCandidatos: jest.fn(), buscarPorIds, invalidar: jest.fn() };
    const criarCompatibilidade = jest.fn(() => new CompatibilidadeEquipeVisitor());
    const gerador = new GeradorDeRelatorio(fonte, criarCompatibilidade, () => DATA_REFERENCIA);

    const projeto = new ProjetoAnimacao(dadosProjeto({ tipoCaptacao: 'ANIMACAO', papeis: [{ papel: 'DIRETOR', peso: 1 }] }));
    const recomendacao = new Recomendacao({
      projetoId: projeto.id,
      estrategia: 'COSSENO',
      membros: [new MembroRecomendado({ papel: 'DIRETOR', profissionalId: 'dir', score: 1, custo: 10000, rodada: 1 })],
    });
    const { relatorio, validacao, compatibilidade } = await gerador.gerar(projeto, recomendacao, new FabricaAnimacao(OPCOES_FABRICA));

    expect(buscarPorIds).toHaveBeenCalledWith(['dir']);
    expect(criarCompatibilidade).toHaveBeenCalledTimes(1);
    expect(relatorio).toHaveProperty('metricasRenderizacao');
    expect(validacao.erros).toEqual(['Animação exige o papel EFEITOS_VISUAIS']);
    expect(compatibilidade.cobertura).toBe(1);
  });
});
