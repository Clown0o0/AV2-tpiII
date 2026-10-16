export interface Cache<K, V> {
  get(chave: K): V | undefined;
  set(chave: K, valor: V): unknown;
}

export function obterOuCalcular<K, V>(cache: Cache<K, V>, chave: K, calcular: () => V): V {
  const emCache = cache.get(chave);
  if (emCache !== undefined) return emCache;
  const valor = calcular();
  cache.set(chave, valor);
  return valor;
}
