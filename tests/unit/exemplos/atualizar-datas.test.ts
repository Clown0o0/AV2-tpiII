import { join } from 'node:path';

interface SistemaDeArquivos {
  mkdirSync(caminho: string, opcoes: { recursive: true }): void;
  readdirSync(caminho: string): string[];
  readFileSync(caminho: string, codificacao: 'utf8'): string;
  writeFileSync(caminho: string, texto: string): void;
}

interface ScriptExemplos {
  DIAS_ATE_A_ENTREGA: number;
  PASTA_GERADOS: string;
  dataDeEntrega(agora?: Date): string;
  comDataDeEntrega(texto: string, data: string): string;
  gerarExemplos(opcoes: { origem: string; destino: string; data: string; sistemaDeArquivos?: SistemaDeArquivos }): string[];
}

const script: ScriptExemplos = require('../../../exemplos/atualizar-datas.js');

// Disco em memória: só o que o script usa.
function discoEmMemoria(arquivos: Record<string, string>) {
  const conteudo = new Map(Object.entries(arquivos));
  const pastasCriadas: string[] = [];
  const sistemaDeArquivos: SistemaDeArquivos = {
    mkdirSync: (caminho) => void pastasCriadas.push(caminho),
    readdirSync: (pasta) => [...conteudo.keys()].filter((c) => join(c, '..') === pasta).map((c) => c.slice(pasta.length + 1)),
    readFileSync: (caminho) => conteudo.get(caminho) ?? '',
    writeFileSync: (caminho, texto) => void conteudo.set(caminho, texto),
  };
  return { conteudo, pastasCriadas, sistemaDeArquivos };
}

describe('exemplos/atualizar-datas.js', () => {
  it('a data de entrega é hoje + 60 dias, em UTC e no formato AAAA-MM-DD', () => {
    expect(script.DIAS_ATE_A_ENTREGA).toBe(60);
    expect(script.dataDeEntrega(new Date('2026-10-15T12:00:00Z'))).toBe('2026-12-14');
    expect(script.dataDeEntrega(new Date('2026-12-31T23:59:59Z'))).toBe('2027-03-01');
    expect(script.dataDeEntrega()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('troca só o valor de dataEntrega e mantém o resto do texto igual', () => {
    const texto = '{\n  "titulo": "Memórias do Rio",\n  "dataEntrega": "2026-12-14",\n  "detalhes": { "tema": "água" }\n}\n';
    expect(script.comDataDeEntrega(texto, '2027-01-02')).toBe(texto.replace('2026-12-14', '2027-01-02'));
    expect(script.comDataDeEntrega('{"aceito": true}\n', '2027-01-02')).toBe('{"aceito": true}\n');
  });

  it('grava as cópias na pasta gerados e nunca altera os modelos', () => {
    const origem = join('raiz', 'exemplos');
    const destino = join(origem, script.PASTA_GERADOS);
    const modelo = '{\n  "titulo": "Doc",\n  "dataEntrega": "2026-12-14"\n}\n';
    const { conteudo, pastasCriadas, sistemaDeArquivos } = discoEmMemoria({
      [join(origem, 'documentario.json')]: modelo,
      [join(origem, 'resposta-convite.json')]: '{"aceito": true}\n',
      [join(origem, 'atualizar-datas.js')]: '// script',
    });

    const gravados = script.gerarExemplos({ origem, destino, data: '2027-01-02', sistemaDeArquivos });

    expect(gravados).toEqual(['documentario.json', 'resposta-convite.json']);
    expect(pastasCriadas).toEqual([destino]);
    expect(conteudo.get(join(origem, 'documentario.json'))).toBe(modelo);
    expect(conteudo.get(join(destino, 'documentario.json'))).toBe(modelo.replace('2026-12-14', '2027-01-02'));
    expect(conteudo.get(join(destino, 'resposta-convite.json'))).toBe('{"aceito": true}\n');
    expect(conteudo.has(join(destino, 'atualizar-datas.js'))).toBe(false);
  });
});
