import { ErroValidacao } from '../errors';

// Vetor esparso de competências técnicas: nome da competência -> nível (0..1).
export type VetorCompetencias = Readonly<Record<string, number>>;

export class Competencia {
  readonly nome: string;
  readonly nivel: number;

  constructor(nome: string, nivel: number) {
    const nomeNormalizado = Competencia.normalizarNome(nome);
    if (!nomeNormalizado) throw new ErroValidacao('Competência sem nome');
    if (!Number.isFinite(nivel) || nivel < 0 || nivel > 1) {
      throw new ErroValidacao(`Nível da competência "${nome}" deve estar entre 0 e 1`);
    }
    this.nome = nomeNormalizado;
    this.nivel = nivel;
  }

  static normalizarNome(nome: string): string {
    return nome.trim().toLowerCase().replace(/\s+/g, '_');
  }

  static normalizarVetor(vetor: Readonly<Record<string, number>>): VetorCompetencias {
    const resultado: Record<string, number> = {};
    for (const [nome, nivel] of Object.entries(vetor)) {
      const competencia = new Competencia(nome, nivel);
      resultado[competencia.nome] = competencia.nivel;
    }
    return resultado;
  }
}

// A norma ao quadrado de cada vetor é calculada uma vez (os vetores não mudam depois de criados).
const NORMAS = new WeakMap<object, number>();

function normaAoQuadrado(vetor: VetorCompetencias): number {
  let norma = NORMAS.get(vetor);
  if (norma === undefined) {
    norma = 0;
    for (const nome in vetor) norma += vetor[nome]! * vetor[nome]!;
    NORMAS.set(vetor, norma);
  }
  return norma;
}

// Similaridade de cosseno entre dois vetores esparsos (0 quando algum vetor é nulo).
export function similaridadeCosseno(a: VetorCompetencias, b: VetorCompetencias): number {
  const normaA = normaAoQuadrado(a);
  const normaB = normaAoQuadrado(b);
  if (normaA === 0 || normaB === 0) return 0;
  let produto = 0;
  for (const nome in a) {
    const outro = b[nome];
    if (outro !== undefined) produto += a[nome]! * outro;
  }
  return produto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}
