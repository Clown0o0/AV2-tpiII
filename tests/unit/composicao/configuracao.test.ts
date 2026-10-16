import {
  ErroConfiguracao,
  LeitorDeAmbiente,
  lerConfiguracao,
  lerOuEncerrar,
  MAIOR_INTERVALO_MS,
} from '../../../src/composicao/configuracao';

const URL_VALIDA = 'postgresql://usuario:segredo@localhost:5432/banco?schema=public';

function erroDe(ler: () => unknown): ErroConfiguracao {
  try {
    ler();
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return erro;
    throw erro;
  }
  throw new Error('esperava ErroConfiguracao');
}

describe('lerConfiguracao', () => {
  it('usa os padrões quando só DATABASE_URL está definida (vazio conta como ausente)', () => {
    expect(lerConfiguracao({ DATABASE_URL: URL_VALIDA, PORT: '', HOST: '  ' })).toEqual({
      databaseUrl: URL_VALIDA,
      porta: 3000,
      host: '0.0.0.0',
      nivelLog: 'info',
      catalogoTtlMs: 60000,
      profissionaisTimeoutMs: 1500,
    });
  });

  it('lê valores válidos', () => {
    const configuracao = lerConfiguracao({
      DATABASE_URL: 'postgres://u:s@h:1/b',
      PORT: '8080',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'warn',
      CATALOGO_TTL_MS: '0',
      PROFISSIONAIS_TIMEOUT_MS: '250',
    });
    expect(configuracao).toMatchObject({ porta: 8080, host: '127.0.0.1', nivelLog: 'warn', catalogoTtlMs: 0, profissionaisTimeoutMs: 250 });
  });

  it('DATABASE_URL ausente gera mensagem clara', () => {
    expect(erroDe(() => lerConfiguracao({})).problemas).toEqual([
      'DATABASE_URL não está definida: crie o .env a partir do .env.example ou defina a variável no ambiente',
    ]);
  });

  it('DATABASE_URL em outro formato é rejeitada sem expor o valor (que contém a senha)', () => {
    const erro = erroDe(() => lerConfiguracao({ DATABASE_URL: 'mysql://u:senhaSecreta@h/b' }));
    expect(erro.message).toMatch(/DATABASE_URL é inválida: use o formato postgresql:\/\//);
    expect(erro.message).not.toContain('senhaSecreta');
  });

  it.each([
    ['PORT', 'abc', /PORT="abc" é inválida: use um número inteiro entre 1 e 65535/],
    ['PORT', '0', /entre 1 e 65535/],
    ['PORT', '70000', /entre 1 e 65535/],
    ['PORT', '3000.5', /PORT="3000.5"/],
    ['CATALOGO_TTL_MS', '-1', /CATALOGO_TTL_MS="-1" é inválida: use um número inteiro entre 0 e 2147483647/],
    ['CATALOGO_TTL_MS', 'NaN', /CATALOGO_TTL_MS="NaN"/],
    ['CATALOGO_TTL_MS', String(MAIOR_INTERVALO_MS + 1), /CATALOGO_TTL_MS/],
    ['PROFISSIONAIS_TIMEOUT_MS', '0', /PROFISSIONAIS_TIMEOUT_MS="0" é inválida: use um número inteiro entre 1/],
    ['PROFISSIONAIS_TIMEOUT_MS', 'Infinity', /PROFISSIONAIS_TIMEOUT_MS="Infinity"/],
    ['LOG_LEVEL', 'verbose', /LOG_LEVEL="verbose" é inválida: use um destes valores: fatal, error, warn, info, debug, trace, silent/],
  ])('%s=%s é rejeitada com o nome da variável e o valor esperado', (nome, valor, mensagem) => {
    expect(() => lerConfiguracao({ DATABASE_URL: URL_VALIDA, [nome]: valor })).toThrow(mensagem);
  });

  it('lista todos os problemas de uma vez', () => {
    const erro = erroDe(() => lerConfiguracao({ PORT: 'x', LOG_LEVEL: 'y' }));
    expect(erro.problemas).toHaveLength(3);
    expect(erro.message.split('\n')[0]).toBe('Configuração inválida:');
  });
});

describe('LeitorDeAmbiente', () => {
  it('lê inteiros dentro dos limites e confirma sem erro', () => {
    const leitor = new LeitorDeAmbiente({ SEED_PROFISSIONAIS: '10000' });
    expect(leitor.inteiro('SEED_PROFISSIONAIS', 300, 0, 1_000_000)).toBe(10000);
    expect(leitor.inteiro('AUSENTE', 300, 0, 1_000_000)).toBe(300);
    expect(() => leitor.confirmar()).not.toThrow();
  });
});

describe('lerOuEncerrar', () => {
  function sair(mensagem: string): never {
    throw new Error(`saiu: ${mensagem}`);
  }

  it('devolve o valor lido', () => {
    expect(lerOuEncerrar(() => 42, sair)).toBe(42);
  });

  it('configuração inválida chama a saída com a mensagem, sem stack', () => {
    expect(() => lerOuEncerrar(() => lerConfiguracao({}), sair)).toThrow(/^saiu: Configuração inválida:\n {2}- DATABASE_URL não está definida/);
  });

  it('outros erros seguem adiante', () => {
    expect(() =>
      lerOuEncerrar(() => {
        throw new TypeError('bug');
      }, sair),
    ).toThrow(TypeError);
  });
});
