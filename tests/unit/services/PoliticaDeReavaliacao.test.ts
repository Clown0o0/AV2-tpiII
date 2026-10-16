import { LIMIARES_PADRAO, PoliticaDeReavaliacao } from '../../../src/services/PoliticaDeReavaliacao';

const semMudanca = { variacaoOrcamento: 0, variacaoPrazoDias: 0, estrategiaAlterada: false };

describe('PoliticaDeReavaliacao', () => {
  const politica = new PoliticaDeReavaliacao(LIMIARES_PADRAO);

  it('reavalia quando forçada, quando a estratégia muda ou quando algum limiar é atingido', () => {
    expect(politica.deveReavaliar(semMudanca, false)).toBe(false);
    expect(politica.deveReavaliar(semMudanca, true)).toBe(true);
    expect(politica.deveReavaliar({ ...semMudanca, estrategiaAlterada: true }, false)).toBe(true);
    expect(politica.deveReavaliar({ ...semMudanca, variacaoOrcamento: 0.1 }, false)).toBe(true);
    expect(politica.deveReavaliar({ ...semMudanca, variacaoOrcamento: 0.09 }, false)).toBe(false);
    expect(politica.deveReavaliar({ ...semMudanca, variacaoPrazoDias: 7 }, false)).toBe(true);
    expect(politica.deveReavaliar({ ...semMudanca, variacaoPrazoDias: 6 }, false)).toBe(false);
  });

  it('usa os limiares recebidos', () => {
    const sensivel = new PoliticaDeReavaliacao({ variacaoOrcamento: 0.01, variacaoPrazoDias: 1 });
    expect(sensivel.deveReavaliar({ ...semMudanca, variacaoOrcamento: 0.02 }, false)).toBe(true);
    expect(sensivel.deveReavaliar({ ...semMudanca, variacaoPrazoDias: 1 }, false)).toBe(true);
  });
});
