import { ErroValidacao } from '../../../src/domain/errors';
import { Projeto } from '../../../src/domain/entities/Projeto';
import { ProjetoAnimacao } from '../../../src/domain/entities/ProjetoAnimacao';
import { ProjetoDocumentario } from '../../../src/domain/entities/ProjetoDocumentario';
import { ProjetoPublicitario } from '../../../src/domain/entities/ProjetoPublicitario';
import { Recomendacao } from '../../../src/domain/entities/Recomendacao';
import { RegistroFabricas } from '../../../src/factories/RegistroFabricas';
import { RegistroPrototipos } from '../../../src/prototypes/RegistroPrototipos';
import { EstruturaEquipe } from '../../../src/visitors/ProjetoVisitor';
import { dadosProjeto, DATA_ENTREGA } from '../../support/fixtures';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? U[] : T[K] };

const PAPEIS_COM_PERFIL = [
  { papel: 'DIRETOR' as const, peso: 3, competenciasDesejadas: { direcao: 1 } },
  { papel: 'ROTEIRISTA' as const, peso: 2 },
  { papel: 'EFEITOS_VISUAIS' as const, peso: 1 },
];

function documentario() {
  return new ProjetoDocumentario(
    dadosProjeto({ tipoCaptacao: 'DOCUMENTARIO', papeis: PAPEIS_COM_PERFIL, detalhes: { tema: 'Rios', entrevistados: ['Ana', 'Bia'] } }),
  );
}

function animacao() {
  return new ProjetoAnimacao(
    dadosProjeto({ tipoCaptacao: 'ANIMACAO', papeis: PAPEIS_COM_PERFIL, detalhes: { tecnica: '3D', softwares: ['Blender'], quadrosPorSegundo: 30 } }),
  );
}

function publicitario() {
  return new ProjetoPublicitario(
    dadosProjeto({
      tipoCaptacao: 'PUBLICITARIO',
      duracaoEstimadaMin: 1,
      papeis: PAPEIS_COM_PERFIL,
      detalhes: { marca: 'Café Aurora', canais: ['TV'], duracaoMaxSegundos: 30 },
    }),
  );
}

// Muta (à força) tudo o que é array/objeto do projeto, para provar que não há referência compartilhada.
function mutarTudo(projeto: Projeto, campoLista: string): void {
  (projeto.papeis as Mutavel<typeof projeto.papeis>).push({ papel: 'EDITOR', peso: 9 });
  (projeto.papeis[0]!.competenciasDesejadas as Record<string, number>).direcao = 0.1;
  ((projeto as unknown as Record<string, string[]>)[campoLista]!).push('intruso');
  projeto.dataEntrega.setFullYear(2099);
}

describe('Prototype — clonar() faz cópia profunda de cada subtipo', () => {
  it.each([
    ['ProjetoDocumentario', documentario, ProjetoDocumentario, 'entrevistados'],
    ['ProjetoAnimacao', animacao, ProjetoAnimacao, 'softwares'],
    ['ProjetoPublicitario', publicitario, ProjetoPublicitario, 'canais'],
    ['Projeto (ficção)', () => new Projeto(dadosProjeto({ papeis: PAPEIS_COM_PERFIL })), Projeto, null],
  ] as const)('%s: novo id, mesmo tipo concreto, mesmos valores e nenhuma referência compartilhada', (_nome, criar, Classe, campoLista) => {
    const original = criar();
    const antes = JSON.stringify({ ...original, detalhes: original.detalhes, dataEntrega: original.dataEntrega });
    const clone = original.clonar();

    expect(clone).toBeInstanceOf(Classe);
    expect(clone.constructor).toBe(original.constructor);
    expect(clone.id).not.toBe(original.id);
    expect(clone.tipoCaptacao).toBe(original.tipoCaptacao);
    expect(clone.papeis).toEqual(original.papeis);
    expect(clone.detalhes).toEqual(original.detalhes);
    expect(clone.orcamentoTotal).toBe(original.orcamentoTotal);
    expect(clone.dataEntrega).toEqual(original.dataEntrega);

    // clone -> original
    mutarTudo(clone, campoLista ?? 'papeis');
    expect(JSON.stringify({ ...original, detalhes: original.detalhes, dataEntrega: original.dataEntrega })).toBe(antes);
    // original -> clone
    const outroClone = original.clonar();
    const antesClone = JSON.stringify({ ...outroClone, detalhes: outroClone.detalhes });
    mutarTudo(original, campoLista ?? 'papeis');
    expect(JSON.stringify({ ...outroClone, detalhes: outroClone.detalhes })).toBe(antesClone);
  });

  it('copia os valores atuais (após alterar) e aplica ajustes', () => {
    const original = documentario();
    original.alterar({ orcamentoTotal: 123000, estrategia: 'ORCAMENTO_REDUZIDO' });
    const clone = original.clonar({ titulo: 'Rios 2', detalhes: { entrevistados: ['Caio'] }, orcamentoTotal: undefined });

    expect(clone.orcamentoTotal).toBe(123000);
    expect(clone.estrategia).toBe('ORCAMENTO_REDUZIDO');
    expect(clone.titulo).toBe('Rios 2');
    expect(clone.detalhes).toEqual({ tema: 'Rios', entrevistados: ['Caio'] });
    expect(original.entrevistados).toEqual(['Ana', 'Bia']);
  });

  it('valores derivados acompanham o ajuste do campo de origem', () => {
    const doc = new ProjetoDocumentario(dadosProjeto({ tipoCaptacao: 'DOCUMENTARIO' }));
    expect(doc.tema).toBe('drama');
    expect(doc.clonar({ genero: 'Música' }).tema).toBe('música');

    const pub = new ProjetoPublicitario(dadosProjeto({ tipoCaptacao: 'PUBLICITARIO', duracaoEstimadaMin: 2 }));
    expect(pub.detalhes).toEqual({ marca: 'Filme Teste', canais: [], duracaoMaxSegundos: 120 });
    expect(pub.clonar({ titulo: 'Campanha X', duracaoEstimadaMin: 1 }).detalhes).toEqual({
      marca: 'Campanha X',
      canais: [],
      duracaoMaxSegundos: 60,
    });
    expect(publicitario().clonar({ titulo: 'Outro' }).marca).toBe('Café Aurora');
  });

  it('ajustes passam pela validação do construtor', () => {
    expect(() => documentario().clonar({ orcamentoTotal: -5 })).toThrow(/Orçamento/);
    expect(() => animacao().clonar({ detalhes: { quadrosPorSegundo: 0 } })).toThrow(/quadrosPorSegundo/);
    expect(() => publicitario().clonar({ detalhes: { canais: 'TV' } })).toThrow(/canais/);
    expect(() => documentario().clonar({ detalhes: { tema: ' ' } })).toThrow(ErroValidacao);
    expect(() => animacao().clonar({ detalhes: { tecnica: 'VR' } })).toThrow(/tecnica/);
  });

  it('subtipos usam valores padrão quando os detalhes não são informados e fixam o próprio tipo', () => {
    const anim = new ProjetoAnimacao(dadosProjeto({ tipoCaptacao: 'FICCAO' }));
    expect(anim.tipoCaptacao).toBe('ANIMACAO');
    expect(anim.detalhes).toEqual({ tecnica: '2D', softwares: [], quadrosPorSegundo: 24 });
    expect(new ProjetoDocumentario(dadosProjeto({ detalhes: null })).detalhes).toEqual({ tema: 'drama', entrevistados: [] });
    expect(new Projeto(dadosProjeto({ detalhes: { tema: 'ignorado' } })).detalhes).toBeNull();
  });
});

describe('RegistroPrototipos', () => {
  it('registra um protótipo e cria novos projetos por clonagem com ajustes', () => {
    const registro = new RegistroPrototipos();
    const modelo = animacao();
    registro.registrar('anim-3d', modelo);
    (modelo.softwares as string[]).push('mudado depois'); // não afeta o modelo guardado

    const a = registro.criarAPartirDe('anim-3d', { titulo: 'Curta A', dataEntrega: DATA_ENTREGA });
    const b = registro.criarAPartirDe('anim-3d', { titulo: 'Curta B', detalhes: { quadrosPorSegundo: 12 } });

    expect(a).toBeInstanceOf(ProjetoAnimacao);
    expect(a.id).not.toBe(b.id);
    expect([a.titulo, b.titulo]).toEqual(['Curta A', 'Curta B']);
    expect((a as ProjetoAnimacao).softwares).toEqual(['Blender']);
    expect((b as ProjetoAnimacao).quadrosPorSegundo).toBe(12);
    expect(registro.chaves()).toEqual(['anim-3d']);
  });

  it('chave inexistente e ajuste inválido lançam ErroValidacao', () => {
    const registro = RegistroPrototipos.padrao();
    expect(() => registro.criarAPartirDe('novela')).toThrow(/Modelo de projeto inexistente: novela/);
    expect(() => registro.criarAPartirDe('documentario', { papeis: [] })).toThrow(ErroValidacao);
    expect(() => registro.criarAPartirDe('publicitario', { detalhes: { duracaoMaxSegundos: -1 } })).toThrow(ErroValidacao);
  });

  it('o registro padrão tem um modelo por tipo, com papéis coerentes com o tipo', () => {
    const registro = RegistroPrototipos.padrao();
    expect(registro.chaves()).toEqual(['ficcao', 'documentario', 'animacao', 'publicitario']);
    const papeis = (chave: string) => registro.criarAPartirDe(chave).papeis.map((p) => p.papel);
    expect(registro.criarAPartirDe('ficcao').tipoCaptacao).toBe('FICCAO');
    expect(registro.criarAPartirDe('documentario')).toBeInstanceOf(ProjetoDocumentario);
    expect(papeis('documentario')).toEqual(['DIRETOR', 'ROTEIRISTA', 'EDITOR']);
    expect(papeis('animacao')).toEqual(['DIRETOR', 'EFEITOS_VISUAIS', 'SONOPLASTA']);
    expect(papeis('publicitario')).toEqual(['DIRETOR', 'DIRETOR_FOTOGRAFIA', 'EDITOR']);
  });

  // Regressão: o modelo publicitário tinha 1 min (60 s) de duração e máximo de 30 s, então todo
  // projeto criado a partir dele saía com o relatório inválido.
  it('cada modelo padrão passa no validador do próprio tipo (fora os papéis ainda sem membro)', () => {
    const registro = RegistroPrototipos.padrao();
    const fabricas = RegistroFabricas.padrao();
    for (const chave of registro.chaves()) {
      const projeto = registro.criarAPartirDe(chave, { dataEntrega: DATA_ENTREGA });
      const recomendacao = new Recomendacao({ projetoId: projeto.id, estrategia: projeto.estrategia, criadaEm: new Date(0) });
      const { erros } = new EstruturaEquipe(projeto, recomendacao, []).aceitar(
        fabricas.obter(projeto.tipoCaptacao).criarValidador(new Date(0)),
      );
      expect({ chave, erros: erros.filter((e) => !e.startsWith('Papel obrigatório')) }).toEqual({ chave, erros: [] });
    }
  });
});
