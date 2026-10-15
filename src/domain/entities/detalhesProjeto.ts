import { ErroValidacao } from '../errors';

// Leitura dos atributos específicos de cada tipo de projeto (vêm do corpo da requisição ou do banco).

export function lerTexto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new ErroValidacao(`Atributo "${campo}" deve ser um texto não vazio`);
  return valor.trim();
}

export function lerListaTextos(valor: unknown, campo: string): string[] {
  if (!Array.isArray(valor)) throw new ErroValidacao(`Atributo "${campo}" deve ser uma lista de textos`);
  return valor.map((item) => lerTexto(item, campo));
}

export function lerNumeroPositivo(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new ErroValidacao(`Atributo "${campo}" deve ser um número positivo`);
  }
  return valor;
}

export function lerOpcao<T extends string>(valor: unknown, opcoes: readonly T[], campo: string): T {
  if (!opcoes.includes(valor as T)) throw new ErroValidacao(`Atributo "${campo}" deve ser um de: ${opcoes.join(', ')}`);
  return valor as T;
}
