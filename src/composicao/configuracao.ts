import { TIMEOUT_PADRAO_MS, TTL_CATALOGO_PADRAO_MS } from '../services/FonteProfissionaisResiliente';

export const NIVEIS_DE_LOG = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type NivelDeLog = (typeof NIVEIS_DE_LOG)[number];

export const PORTA_PADRAO = 3000;
export const HOST_PADRAO = '0.0.0.0';
// Maior atraso aceito por setTimeout/setInterval; acima disso o Node dispara imediatamente.
export const MAIOR_INTERVALO_MS = 2_147_483_647;

export interface Configuracao {
  databaseUrl: string;
  porta: number;
  host: string;
  nivelLog: NivelDeLog;
  catalogoTtlMs: number;
  profissionaisTimeoutMs: number;
}

export type Ambiente = Readonly<Record<string, string | undefined>>;

export class ErroConfiguracao extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(`Configuração inválida:\n${problemas.map((problema) => `  - ${problema}`).join('\n')}`);
    this.name = 'ErroConfiguracao';
  }
}

// Lê as variáveis acumulando todos os problemas, para a mensagem listar tudo de uma vez.
// Variável vazia conta como ausente (ex.: "PORT=" no .env).
export class LeitorDeAmbiente {
  private readonly problemas: string[] = [];

  constructor(private readonly ambiente: Ambiente) {}

  inteiro(nome: string, padrao: number, minimo: number, maximo: number): number {
    const bruto = this.valor(nome);
    if (bruto === undefined) return padrao;
    const numero = Number(bruto);
    if (/^\d+$/.test(bruto) && numero >= minimo && numero <= maximo) return numero;
    this.problemas.push(`${nome}="${bruto}" é inválida: use um número inteiro entre ${minimo} e ${maximo}`);
    return padrao;
  }

  opcao<T extends string>(nome: string, opcoes: readonly T[], padrao: T): T {
    const bruto = this.valor(nome);
    if (bruto === undefined) return padrao;
    const escolhida = opcoes.find((opcao) => opcao === bruto);
    if (escolhida === undefined) this.problemas.push(`${nome}="${bruto}" é inválida: use um destes valores: ${opcoes.join(', ')}`);
    return escolhida ?? padrao;
  }

  texto(nome: string, padrao: string): string {
    return this.valor(nome) ?? padrao;
  }

  // O valor da URL nunca entra na mensagem: ela contém a senha do banco.
  urlDoBanco(nome: string): string {
    const bruto = this.valor(nome);
    if (bruto === undefined) {
      this.problemas.push(`${nome} não está definida: crie o .env a partir do .env.example ou defina a variável no ambiente`);
    } else if (!/^postgres(ql)?:\/\//.test(bruto)) {
      this.problemas.push(`${nome} é inválida: use o formato postgresql://USUARIO:SENHA@HOST:PORTA/BANCO?schema=public`);
    }
    return bruto ?? '';
  }

  confirmar(): void {
    if (this.problemas.length > 0) throw new ErroConfiguracao(this.problemas);
  }

  private valor(nome: string): string | undefined {
    const bruto = this.ambiente[nome]?.trim();
    return bruto === '' ? undefined : bruto;
  }
}

// Único ponto de leitura das variáveis de ambiente do servidor.
export function lerConfiguracao(ambiente: Ambiente): Configuracao {
  const leitor = new LeitorDeAmbiente(ambiente);
  const configuracao: Configuracao = {
    databaseUrl: leitor.urlDoBanco('DATABASE_URL'),
    porta: leitor.inteiro('PORT', PORTA_PADRAO, 1, 65535),
    host: leitor.texto('HOST', HOST_PADRAO),
    nivelLog: leitor.opcao('LOG_LEVEL', NIVEIS_DE_LOG, 'info'),
    catalogoTtlMs: leitor.inteiro('CATALOGO_TTL_MS', TTL_CATALOGO_PADRAO_MS, 0, MAIOR_INTERVALO_MS),
    profissionaisTimeoutMs: leitor.inteiro('PROFISSIONAIS_TIMEOUT_MS', TIMEOUT_PADRAO_MS, 1, MAIOR_INTERVALO_MS),
  };
  leitor.confirmar();
  return configuracao;
}

// Configuração inválida encerra com a mensagem em português e código 1, sem stack.
export function lerOuEncerrar<T>(ler: () => T, sair: (mensagem: string) => never = sairComErro): T {
  try {
    return ler();
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return sair(erro.message);
    throw erro;
  }
}

function sairComErro(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}
