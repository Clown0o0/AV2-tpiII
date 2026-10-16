import { obterOuCalcular } from '../../../src/compartilhado/memoizacao';

describe('obterOuCalcular', () => {
  it('calcula na primeira vez e reaproveita o valor guardado depois', () => {
    const cache = new Map<string, number>();
    const calcular = jest.fn(() => 42);
    expect(obterOuCalcular(cache, 'a', calcular)).toBe(42);
    expect(obterOuCalcular(cache, 'a', calcular)).toBe(42);
    expect(calcular).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toBe(42);
  });

  it('funciona com WeakMap e chaves diferentes não se misturam', () => {
    const cache = new WeakMap<object, string>();
    const a = {};
    const b = {};
    expect(obterOuCalcular(cache, a, () => 'A')).toBe('A');
    expect(obterOuCalcular(cache, b, () => 'B')).toBe('B');
    expect(obterOuCalcular(cache, a, () => 'outro')).toBe('A');
  });
});
