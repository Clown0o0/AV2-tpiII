import { ProjetoAnimacao } from '../../../src/domain/entities/ProjetoAnimacao';
import { MembroRecomendado, Recomendacao } from '../../../src/domain/entities/Recomendacao';
import { FabricaAnimacao } from '../../../src/factories/animacao/FabricaAnimacao';
import {
  DESCRICAO_METRICAS_RENDERIZACAO,
  RelatorioAnimacaoVisitor,
} from '../../../src/factories/animacao/RelatorioAnimacaoVisitor';
import { FabricaDocumentario } from '../../../src/factories/documentario/FabricaDocumentario';
import { FabricaFiccao } from '../../../src/factories/ficcao/FabricaFiccao';
import { FabricaPublicitario } from '../../../src/factories/publicitario/FabricaPublicitario';
import { EstruturaEquipe } from '../../../src/visitors/ProjetoVisitor';
import { RelatorioVisitor } from '../../../src/visitors/RelatorioVisitor';
import { criarProfissional, criarProjeto, dadosProjeto, OPCOES_FABRICA } from '../../support/fixtures';

function equipeDeAnimacao(): EstruturaEquipe {
  const projeto = new ProjetoAnimacao(
    dadosProjeto({
      tipoCaptacao: 'ANIMACAO',
      duracaoEstimadaMin: 10,
      detalhes: { tecnica: '3D', quadrosPorSegundo: 30 },
      papeis: [
        { papel: 'DIRETOR', peso: 1 },
        { papel: 'EFEITOS_VISUAIS', peso: 2 },
      ],
    }),
  );
  const recomendacao = new Recomendacao({
    projetoId: projeto.id,
    estrategia: 'COSSENO',
    membros: [
      new MembroRecomendado({ papel: 'DIRETOR', profissionalId: 'dir', score: 1, custo: 12000, rodada: 1 }),
      new MembroRecomendado({ papel: 'EFEITOS_VISUAIS', profissionalId: 'vfx', score: 1, custo: 6000, rodada: 1 }),
    ],
  });
  const profissionais = [criarProfissional({ id: 'dir' }), criarProfissional({ id: 'vfx', especialidades: ['EFEITOS_VISUAIS'] })];
  return new EstruturaEquipe(projeto, recomendacao, profissionais);
}

describe('RelatorioAnimacaoVisitor', () => {
  it('acrescenta ao relatório base as métricas de renderização derivadas do projeto e da equipe', () => {
    const estrutura = equipeDeAnimacao();
    const base = estrutura.aceitar(new RelatorioVisitor());
    const animacao = estrutura.aceitar(new RelatorioAnimacaoVisitor());

    // 10 min * 60 s * 30 qps = 18000 quadros; custo 18000 / 18000 quadros = 1.00 por quadro
    expect(animacao).toMatchObject({
      ...base,
      texto: expect.stringContaining(base.texto),
      metricasRenderizacao: {
        descricao: DESCRICAO_METRICAS_RENDERIZACAO,
        tecnica: '3D',
        quadrosPorSegundo: 30,
        duracaoEstimadaMin: 10,
        totalQuadrosEstimado: 18000,
        custoEstimadoPorQuadro: 1,
        papeisEfeitosVisuaisPreenchidos: 1,
      },
    });
    expect(animacao.texto).toContain('Renderização (estimativa): 3D, 30 qps, 18000 quadros, custo por quadro 1.00');
  });

  it('com projeto que não é animação, o resultado é igual ao do relatório base (sem métricas)', () => {
    const projeto = criarProjeto();
    const estrutura = new EstruturaEquipe(projeto, new Recomendacao({ projetoId: projeto.id, estrategia: 'COSSENO' }), []);
    const resultado = estrutura.aceitar(new RelatorioAnimacaoVisitor());
    expect(resultado).toEqual(estrutura.aceitar(new RelatorioVisitor()));
    expect(resultado).not.toHaveProperty('metricasRenderizacao');
  });

  it('cada fábrica cria o relatório do próprio tipo', () => {
    expect(new FabricaAnimacao(OPCOES_FABRICA).criarRelatorio()).toBeInstanceOf(RelatorioAnimacaoVisitor);
    for (const fabrica of [new FabricaFiccao(OPCOES_FABRICA), new FabricaDocumentario(OPCOES_FABRICA), new FabricaPublicitario(OPCOES_FABRICA)]) {
      expect(fabrica.criarRelatorio().constructor).toBe(RelatorioVisitor);
    }
  });
});
