import { FonteProfissionaisResiliente } from '../../../src/services/FonteProfissionaisResiliente';
import { criarProfissional, DATA_ENTREGA, DATA_REFERENCIA } from '../../support/fixtures';
import { InMemoryProfissionalRepository } from '../../support/InMemoryRepositories';

const filtro = { papeis: ['DIRETOR' as const], disponivelDe: DATA_REFERENCIA, disponivelAte: DATA_ENTREGA };

describe('FonteProfissionaisResiliente', () => {
  it('filtra o catálogo em memória por papel, disponibilidade e preço', async () => {
    const repo = new InMemoryProfissionalRepository([
      criarProfissional({ id: 'barato', precoMin: 1000 }),
      criarProfissional({ id: 'caro', precoMin: 90000 }),
      criarProfissional({ id: 'editor', especialidades: ['EDITOR'] }),
      criarProfissional({ id: 'ocupado', disponibilidade: [{ inicio: new Date('2026-01-01'), fim: new Date('2026-01-02') }] }),
    ]);
    const fonte = new FonteProfissionaisResiliente(repo);

    const todos = await fonte.buscarCandidatos(filtro);
    expect(todos).toEqual({ profissionais: expect.any(Array), fonte: 'REPOSITORIO' });
    expect(todos.profissionais.map((p) => p.id)).toEqual(['barato', 'caro']);
    expect((await fonte.buscarCandidatos({ ...filtro, precoMinMaximo: 5000 })).profissionais.map((p) => p.id)).toEqual(['barato']);
    expect((await fonte.buscarCandidatos({ ...filtro, papeis: ['EDITOR'] })).profissionais.map((p) => p.id)).toEqual(['editor']);
  });

  it('consulta o repositório uma vez enquanto o catálogo está válido', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
    const fonte = new FonteProfissionaisResiliente(repo, { ttlMs: 60000 });
    for (let i = 0; i < 5; i++) await fonte.buscarCandidatos(filtro);
    expect(repo.consultas).toBe(1);
  });

  it('com ttl vencido recarrega e enxerga profissionais novos', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
    const fonte = new FonteProfissionaisResiliente(repo, { ttlMs: 0 });
    expect((await fonte.buscarCandidatos(filtro)).profissionais).toHaveLength(1);
    repo.profissionais = [...repo.profissionais, criarProfissional({ id: 'b' })];
    expect((await fonte.buscarCandidatos(filtro)).profissionais).toHaveLength(2);
    expect(repo.consultas).toBe(2);
  });

  it('invalidar força a recarga na próxima busca', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
    const fonte = new FonteProfissionaisResiliente(repo, { ttlMs: 60000 });
    fonte.invalidar();
    await fonte.buscarCandidatos(filtro);
    repo.profissionais = [];
    await fonte.buscarCandidatos(filtro);
    fonte.invalidar();
    expect((await fonte.buscarCandidatos(filtro)).profissionais).toEqual([]);
    expect(repo.consultas).toBe(2);
  });

  it('requisições simultâneas compartilham uma única carga', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
    repo.atrasoMs = 20;
    const fonte = new FonteProfissionaisResiliente(repo, { timeoutMs: 1000 });
    const resultados = await Promise.all(Array.from({ length: 100 }, () => fonte.buscarCandidatos(filtro)));
    expect(repo.consultas).toBe(1);
    expect(resultados.every((r) => r.fonte === 'REPOSITORIO' && r.profissionais.length === 1)).toBe(true);
  });

  it('usa o último catálogo quando o repositório cai depois do ttl', async () => {
    const repo = new InMemoryProfissionalRepository([
      criarProfissional({ id: 'barato', precoMin: 1000 }),
      criarProfissional({ id: 'caro', precoMin: 90000 }),
    ]);
    const falhas: string[] = [];
    const fonte = new FonteProfissionaisResiliente(repo, { ttlMs: 0, aoFalhar: (_e, op) => falhas.push(op) });
    await fonte.buscarCandidatos(filtro);

    repo.indisponivel = true;
    const resultado = await fonte.buscarCandidatos({ ...filtro, precoMinMaximo: 5000 });
    expect(resultado).toEqual({ profissionais: [expect.objectContaining({ id: 'barato' })], fonte: 'CACHE', erro: 'conexão recusada' });
    expect(falhas).toEqual(['buscarCandidatos']);
  });

  it('sem catálogo e com o repositório fora, devolve vazio como INDISPONIVEL', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
    repo.indisponivel = true;
    const resultado = await new FonteProfissionaisResiliente(repo).buscarCandidatos(filtro);
    expect(resultado).toEqual({ profissionais: [], fonte: 'INDISPONIVEL', erro: 'conexão recusada' });
  });

  it('buscarPorIds usa o catálogo quando o repositório cai e sinaliza INDISPONIVEL sem nada carregado', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
    const fonte = new FonteProfissionaisResiliente(repo);
    await fonte.buscarCandidatos(filtro);
    repo.indisponivel = true;
    expect((await fonte.buscarPorIds(['a', 'b'])).fonte).toBe('CACHE');
    expect((await fonte.buscarPorIds(['b'])).fonte).toBe('INDISPONIVEL');
  });

  it('converte erros que não são Error em mensagem', async () => {
    const fonte = new FonteProfissionaisResiliente({
      listarTodos: () => Promise.reject('string de erro'),
      buscarPorIds: () => Promise.reject(42),
    });
    expect((await fonte.buscarCandidatos(filtro)).erro).toBe('string de erro');
    expect((await fonte.buscarPorIds(['x'])).erro).toBe('42');
  });

  it('timeout aciona o fallback, mas a carga lenta termina e atualiza o catálogo', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional()]);
    repo.atrasoMs = 60;
    const fonte = new FonteProfissionaisResiliente(repo, { timeoutMs: 10 });
    const resultado = await fonte.buscarCandidatos(filtro);
    expect(resultado.fonte).toBe('INDISPONIVEL');
    expect(resultado.erro).toMatch(/excedeu 10ms/);

    await new Promise((r) => setTimeout(r, 120));
    expect((await fonte.buscarCandidatos(filtro)).fonte).toBe('REPOSITORIO');
    expect(repo.consultas).toBe(1);
  });

  it('iniciar carrega o catálogo e a atualização periódica o mantém atual até parar()', async () => {
    jest.useFakeTimers();
    try {
      const repo = new InMemoryProfissionalRepository([criarProfissional({ id: 'a' })]);
      const falhas: string[] = [];
      const fonte = new FonteProfissionaisResiliente(repo, { ttlMs: 2000, aoFalhar: (_e, op) => falhas.push(op) });
      await fonte.iniciar();
      expect(repo.consultas).toBe(1);

      await jest.advanceTimersByTimeAsync(1000);
      expect(repo.consultas).toBe(2);

      repo.indisponivel = true;
      await jest.advanceTimersByTimeAsync(1000);
      expect(falhas).toEqual(['atualizarCatalogo']);

      fonte.parar();
      const antes = repo.consultas;
      await jest.advanceTimersByTimeAsync(5000);
      expect(repo.consultas).toBe(antes);
    } finally {
      jest.useRealTimers();
    }
  });

  it('com ttl 0 não agenda atualização periódica', async () => {
    const repo = new InMemoryProfissionalRepository([criarProfissional()]);
    const fonte = new FonteProfissionaisResiliente(repo, { ttlMs: 0 });
    await fonte.iniciar();
    expect(repo.consultas).toBe(1);
    fonte.parar();
  });
});
