import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app';
import type { OrigemDosProfissionais } from '../../src/domain/ports/FonteDeProfissionais';
import type { ConviteJson, MembroJson, ProjetoJson, RecomendacaoJson } from '../../src/routes/serializadores';
import type { LinhaEquipe } from '../../src/visitors/RelatorioVisitor';
import { ErroDominio } from '../../src/domain/errors';
import { RecomendacaoEventEmitter } from '../../src/events/RecomendacaoEventEmitter';
import { AuditoriaObservador } from '../../src/events/observadores/AuditoriaObservador';
import { EmailObservador } from '../../src/events/observadores/EmailObservador';
import { MensagemInternaObservador } from '../../src/events/observadores/MensagemInternaObservador';
import { CossenoStrategy } from '../../src/strategies/CossenoStrategy';
import { RegistroEstrategias } from '../../src/strategies/RegistroEstrategias';
import { DATA_ENTREGA, DATA_REFERENCIA, elencoCompleto } from '../support/fixtures';
import { InMemoryProfissionalRepository, InMemoryProjetoRepository, LoggerMemoria } from '../support/InMemoryRepositories';
import { criarSistemaDeTeste } from '../support/sistema';

/** Sobe o app Fastify completo com o banco substituído por repositórios em memória. */
function montarApp() {
  const profissionais = new InMemoryProfissionalRepository(elencoCompleto());
  const projetos = new InMemoryProjetoRepository();
  const logger = new LoggerMemoria();
  const email = new EmailObservador(logger);
  const mensagens = new MensagemInternaObservador(logger);
  const auditoria = new AuditoriaObservador(logger);
  const eventos = new RecomendacaoEventEmitter().registrar(email, mensagens, auditoria);
  const app = construirApp({
    montarServico: () =>
      criarSistemaDeTeste({ profissionais, projetos, eventos, relogio: () => DATA_REFERENCIA, opcoesFonte: { timeoutMs: 100, ttlMs: 0 } }),
  });
  return { app, profissionais, projetos, eventos, email, mensagens, auditoria };
}

const corpoProjeto = {
  titulo: 'Sertão em Chamas',
  produtorId: 'produtor-7',
  produtorEmail: 'produtora@filmes.dev',
  genero: 'Drama',
  duracaoEstimadaMin: 95,
  orcamentoTotal: 180000,
  dataEntrega: DATA_ENTREGA.toISOString(),
  tipoCaptacao: 'FICCAO',
  localizacao: 'São Paulo',
  estrategia: 'COSSENO',
  papeis: [
    { papel: 'DIRETOR', peso: 3 },
    { papel: 'DIRETOR_FOTOGRAFIA', peso: 2, competenciasDesejadas: { fotografia: 1, iluminacao: 1 } },
    { papel: 'SONOPLASTA', peso: 1 },
  ],
};

interface RespostaRecomendacao {
  projeto: ProjetoJson;
  recomendacao: RecomendacaoJson;
  fonteProfissionais: OrigemDosProfissionais;
}

async function recomendar(app: FastifyInstance, corpo: object = corpoProjeto): Promise<RespostaRecomendacao> {
  const resposta = await app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpo });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<RespostaRecomendacao>();
}

describe('API REST de recomendação (ponta a ponta)', () => {
  let ctx: ReturnType<typeof montarApp>;

  beforeEach(() => {
    ctx = montarApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('GET /health', async () => {
    expect((await ctx.app.inject('/health')).json()).toEqual({ status: 'ok' });
  });

  it('rotas de consulta não expostas pela API respondem 404', async () => {
    expect((await ctx.app.inject('/estrategias')).statusCode).toBe(404);
    expect((await ctx.app.inject('/projetos/qualquer')).statusCode).toBe(404);
  });

  it('fluxo completo: recomendar -> convidar -> aceitar convites -> equipe finalizada', async () => {
    const { app, eventos, email, mensagens, auditoria, projetos } = ctx;
    const { projeto, recomendacao, fonteProfissionais } = await recomendar(app);

    expect(fonteProfissionais).toBe('REPOSITORIO');
    expect(projeto).toMatchObject({ titulo: 'Sertão em Chamas', genero: 'drama', orcamentoTotal: 180000 });
    expect(recomendacao.equipe.map((m) => [m.papel, m.profissionalId])).toEqual([
      ['DIRETOR', 'DIRETOR-top'],
      ['DIRETOR_FOTOGRAFIA', 'DIRETOR_FOTOGRAFIA-top'],
      ['SONOPLASTA', 'SONOPLASTA-top'],
    ]);
    expect(recomendacao.custoTotal).toBeLessThanOrEqual(180000);

    const convites: ConviteJson[] = [];
    for (const papel of ['DIRETOR', 'DIRETOR_FOTOGRAFIA', 'SONOPLASTA']) {
      const r = await app.inject({ method: 'POST', url: `/recomendacoes/${recomendacao.id}/membros/${papel}/aceitar` });
      expect(r.statusCode).toBe(201);
      convites.push(r.json().convite);
    }

    const detalhe = (await app.inject(`/recomendacoes/${recomendacao.id}`)).json();
    expect(detalhe.convites.map((c: ConviteJson) => c.status)).toEqual(['PENDENTE', 'PENDENTE', 'PENDENTE']);
    expect(detalhe.equipe.every((m: MembroJson) => m.status === 'CONVIDADO')).toBe(true);

    let ultima: Partial<{ equipeFinalizada: boolean; recomendacao: RecomendacaoJson }> = {};
    for (const convite of convites) {
      const r = await app.inject({ method: 'POST', url: `/convites/${convite.id}/responder`, payload: { aceito: true } });
      expect(r.statusCode).toBe(200);
      ultima = r.json();
    }
    expect(ultima.equipeFinalizada).toBe(true);
    expect(ultima.recomendacao?.status).toBe('FINALIZADA');
    expect(ultima.recomendacao?.finalizadaEm).toBe(DATA_REFERENCIA.toISOString());
    expect(projetos.recomendacoes.get(recomendacao.id)?.status).toBe('FINALIZADA');

    await eventos.aguardarPendentes();
    // Profissionais notificados do interesse; produtor notificado dos aceites e da finalização.
    expect(email.enviados.filter((e) => e.assunto.startsWith('Convite para o projeto'))).toHaveLength(3);
    expect(email.enviados.filter((e) => e.para === 'produtora@filmes.dev').map((e) => e.assunto)).toEqual([
      'Equipe recomendada para "Sertão em Chamas"',
      'Convite aceito: DIRETOR',
      'Convite aceito: DIRETOR_FOTOGRAFIA',
      'Convite aceito: SONOPLASTA',
      'Equipe formada para "Sertão em Chamas"',
    ]);
    expect(mensagens.caixaDe('DIRETOR-top').map((m) => m.texto)).toEqual([
      'Um produtor tem interesse em você para "Sertão em Chamas"',
      'Você recebeu um convite para "Sertão em Chamas" (DIRETOR)',
      'A equipe de "Sertão em Chamas" está completa. Bem-vindo(a)!',
    ]);
    const auditados = auditoria.registros.map((r) => r.evento);
    expect(auditados).toEqual(
      expect.arrayContaining([
        'recomendacao.gerada',
        'convite.interesse-produtor',
        'convite.aceito',
        'equipe.finalizada',
        'integracao.gerenciamento-projetos.iniciar',
        'integracao.financeiro.iniciar',
      ]),
    );
    expect(auditoria.registros.filter((r) => r.ator.tipo === 'PROFISSIONAL')).toHaveLength(3);

    const relatorio = (await app.inject(`/recomendacoes/${recomendacao.id}/relatorio`)).json();
    expect(relatorio.validacao.valida).toBe(true);
    expect(relatorio.relatorio.equipe.every((l: LinhaEquipe) => l.status === 'CONFIRMADO')).toBe(true);
    expect(relatorio.compatibilidade.cobertura).toBe(1);

    const reavaliar = await app.inject({ method: 'PATCH', url: `/projetos/${projeto.id}`, payload: { orcamentoTotal: 50000 } });
    expect(reavaliar.statusCode).toBe(409);
  });

  it('rejeitar e substituir: nova rodada apenas para o papel afetado', async () => {
    const { app } = ctx;
    const { recomendacao } = await recomendar(app);
    const antes = Object.fromEntries(recomendacao.equipe.map((m) => [m.papel, m.id]));

    const rejeitada = await app.inject({ method: 'POST', url: `/recomendacoes/${recomendacao.id}/membros/SONOPLASTA/rejeitar` });
    expect(rejeitada.statusCode).toBe(200);
    expect(rejeitada.json<RecomendacaoJson>().equipe.map((m) => m.papel)).toEqual(['DIRETOR', 'DIRETOR_FOTOGRAFIA']);
    expect(rejeitada.json().parcial).toBe(true);

    const substituida = await app.inject({
      method: 'POST',
      url: `/recomendacoes/${recomendacao.id}/membros/DIRETOR/substituir`,
      payload: { estrategia: 'ORCAMENTO_REDUZIDO' },
    });
    expect(substituida.statusCode).toBe(200);
    const corpo = substituida.json();
    expect(corpo.novoMembro).toMatchObject({ papel: 'DIRETOR', profissionalId: 'DIRETOR-junior', rodada: 2 });
    const depois = Object.fromEntries(corpo.recomendacao.equipe.map((m: MembroJson) => [m.papel, m.id]));
    expect(depois.DIRETOR_FOTOGRAFIA).toBe(antes.DIRETOR_FOTOGRAFIA);
    expect(depois.DIRETOR).not.toBe(antes.DIRETOR);
    expect(corpo.recomendacao.historico.map((m: MembroJson) => [m.papel, m.status])).toEqual([
      ['DIRETOR', 'SUBSTITUIDO'],
      ['SONOPLASTA', 'REJEITADO'],
    ]);

    const semCorpo = await app.inject({ method: 'POST', url: `/recomendacoes/${recomendacao.id}/membros/SONOPLASTA/substituir` });
    expect(semCorpo.statusCode).toBe(200);
    expect(semCorpo.json().novoMembro.profissionalId).toBe('SONOPLASTA-junior');
    expect(semCorpo.json().recomendacao.parcial).toBe(false);
  });

  it('recusa de convite é reportada ao produtor', async () => {
    const { app, eventos, email } = ctx;
    const { recomendacao } = await recomendar(app);
    const { convite } = (await app.inject({ method: 'POST', url: `/recomendacoes/${recomendacao.id}/membros/DIRETOR/aceitar` })).json();
    const resposta = await app.inject({ method: 'POST', url: `/convites/${convite.id}/responder`, payload: { aceito: false } });
    expect(resposta.json()).toMatchObject({ equipeFinalizada: false, convite: { status: 'RECUSADO' } });
    await eventos.aguardarPendentes();
    expect(email.enviados.at(-1)?.assunto).toBe('Convite recusado: DIRETOR');
  });

  it('PATCH /projetos/:id reavalia a equipe somente em alterações significativas', async () => {
    const { app } = ctx;
    const { projeto, recomendacao } = await recomendar(app);

    const pequena = await app.inject({ method: 'PATCH', url: `/projetos/${projeto.id}`, payload: { orcamentoTotal: 185000 } });
    expect(pequena.json()).toMatchObject({
      reavaliada: false,
      projeto: { orcamentoTotal: 185000 },
      recomendacao: { id: recomendacao.id },
    });

    const novaData = new Date(DATA_ENTREGA.getTime() + 60 * 86400000).toISOString();
    const grande = await app.inject({ method: 'PATCH', url: `/projetos/${projeto.id}`, payload: { dataEntrega: novaData } });
    const corpo = grande.json();
    expect(corpo.reavaliada).toBe(true);
    expect(corpo.projeto.dataEntrega).toBe(novaData);
    expect(corpo.recomendacao.id).not.toBe(recomendacao.id);

    expect((await app.inject(`/recomendacoes/${recomendacao.id}`)).json().status).toBe('OBSOLETA');
  });

  it('a estratégia escolhida pelo produtor muda a equipe recomendada', async () => {
    const { app } = ctx;
    const cosseno = await recomendar(app);
    const reduzido = await recomendar(app, { ...corpoProjeto, estrategia: 'ORCAMENTO_REDUZIDO', orcamentoTotal: 40000 });
    expect(reduzido.recomendacao.estrategia).toBe('ORCAMENTO_REDUZIDO');
    expect(reduzido.recomendacao.equipe.map((m) => m.profissionalId)).not.toEqual(
      cosseno.recomendacao.equipe.map((m) => m.profissionalId),
    );
  });

  it('repositório de profissionais indisponível: responde com fallback, sem quebrar', async () => {
    const { app, profissionais } = ctx;
    await recomendar(app); // aquece o cache
    profissionais.indisponivel = true;
    const comCache = await recomendar(app);
    expect(comCache.fonteProfissionais).toBe('CACHE');
    expect(comCache.recomendacao.parcial).toBe(true);
    expect(comCache.recomendacao.equipe).toHaveLength(3);

    const semCache = montarApp();
    semCache.profissionais.indisponivel = true;
    const vazio = await recomendar(semCache.app);
    expect(vazio.fonteProfissionais).toBe('INDISPONIVEL');
    expect(vazio.recomendacao.equipe).toEqual([]);
    expect(vazio.recomendacao.avisos.join()).toMatch(/indisponível/);
    await semCache.app.close();
  });

  it('banco inteiro fora do ar: /health continua ok e as rotas respondem erro genérico, sem derrubar o app', async () => {
    const { app, profissionais, projetos } = ctx;
    await recomendar(app);
    profissionais.indisponivel = true;
    projetos.falharComErroGenerico = true;
    const resposta = await app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpoProjeto });
    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno inesperado; tente novamente.' });
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/projetos/modelos')).statusCode).toBe(200);

    profissionais.indisponivel = false;
    projetos.falharComErroGenerico = false;
    await recomendar(app);
  });

  describe('erros tratados', () => {
    it('400 para corpo inválido', async () => {
      const resposta = await ctx.app.inject({
        method: 'POST',
        url: '/projetos/recomendar',
        payload: { ...corpoProjeto, papeis: [{ papel: 'CAMERA', peso: 1 }] },
      });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('REQUISICAO_INVALIDA');
    });

    it('400 (e não 500) para JSON malformado', async () => {
      const resposta = await ctx.app.inject({
        method: 'POST',
        url: '/projetos/recomendar',
        headers: { 'content-type': 'application/json' },
        payload: '{"titulo": ',
      });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('REQUISICAO_INVALIDA');
    });

    it('422 para regra de domínio violada', async () => {
      const resposta = await ctx.app.inject({
        method: 'POST',
        url: '/projetos/recomendar',
        payload: { ...corpoProjeto, dataEntrega: '2020-01-01T00:00:00Z' },
      });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({ erro: 'VALIDACAO' });
    });

    it('404 para recursos inexistentes', async () => {
      const projeto = await ctx.app.inject({ method: 'PATCH', url: '/projetos/nao-existe', payload: { orcamentoTotal: 1 } });
      expect(projeto.statusCode).toBe(404);
      for (const url of ['/recomendacoes/nao-existe', '/recomendacoes/nao-existe/relatorio']) {
        const resposta = await ctx.app.inject(url);
        expect(resposta.statusCode).toBe(404);
        expect(resposta.json().erro).toBe('NAO_ENCONTRADO');
      }
      const convite = await ctx.app.inject({ method: 'POST', url: '/convites/x/responder', payload: { aceito: true } });
      expect(convite.statusCode).toBe(404);
    });

    it('409 para transição de estado inválida', async () => {
      const { recomendacao } = await recomendar(ctx.app);
      const url = `/recomendacoes/${recomendacao.id}/membros/DIRETOR/aceitar`;
      await ctx.app.inject({ method: 'POST', url });
      const segunda = await ctx.app.inject({ method: 'POST', url });
      expect(segunda.statusCode).toBe(409);
      expect(segunda.json().erro).toBe('ESTADO_INVALIDO');
    });

    it('um erro de domínio novo responde com o próprio status, sem mudar o app', async () => {
      class ErroPrazoBloqueado extends ErroDominio {
        readonly codigo = 'PRAZO_BLOQUEADO';
        readonly codigoHttp = 423;
      }
      ctx.projetos.salvar = async () => {
        throw new ErroPrazoBloqueado('prazo bloqueado para edição');
      };
      const resposta = await ctx.app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpoProjeto });
      expect(resposta.statusCode).toBe(423);
      expect(resposta.json()).toEqual({ erro: 'PRAZO_BLOQUEADO', mensagem: 'prazo bloqueado para edição' });
    });

    it('o schema aceita só as estratégias registradas', async () => {
      const app = construirApp({
        montarServico: () =>
          criarSistemaDeTeste({
            profissionais: new InMemoryProfissionalRepository(elencoCompleto()),
            projetos: new InMemoryProjetoRepository(),
            eventos: new RecomendacaoEventEmitter(),
            estrategias: new RegistroEstrategias([new CossenoStrategy()]),
            relogio: () => DATA_REFERENCIA,
          }),
      });
      const payload = { ...corpoProjeto, estrategia: 'ORCAMENTO_REDUZIDO' };
      expect((await app.inject({ method: 'POST', url: '/projetos/recomendar', payload })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpoProjeto })).statusCode).toBe(201);
      await app.close();
    });

    it.each([
      ['orçamento acima da coluna Decimal(14,2)', { orcamentoTotal: 1e12 }],
      ['duração acima de um inteiro de 32 bits', { duracaoEstimadaMin: 3e9 }],
      ['texto com caractere nulo', { titulo: 'Sertão\u0000' }],
      ['caractere nulo dentro de detalhes', { detalhes: { observacao: ['a\u0000'] } }],
    ])('400 (e não 500 do banco) para %s', async (_caso, campos) => {
      const resposta = await ctx.app.inject({ method: 'POST', url: '/projetos/recomendar', payload: { ...corpoProjeto, ...campos } });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('REQUISICAO_INVALIDA');
    });

    it('400 para orçamento acima do limite também no PATCH', async () => {
      const { projeto } = await recomendar(ctx.app);
      const resposta = await ctx.app.inject({ method: 'PATCH', url: `/projetos/${projeto.id}`, payload: { orcamentoTotal: 1e12 } });
      expect(resposta.statusCode).toBe(400);
    });

    it.each([
      ['dia que não existe no calendário', '2026-02-30'],
      ['ano com mais de 4 dígitos', '+275760-09-13T00:00:00.000Z'],
    ])('422 para data de entrega com %s', async (_caso, dataEntrega) => {
      const resposta = await ctx.app.inject({ method: 'POST', url: '/projetos/recomendar', payload: { ...corpoProjeto, dataEntrega } });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toEqual({ erro: 'VALIDACAO', mensagem: 'Data de entrega inválida' });
    });

    it('rota ou método inexistente responde 404 no mesmo formato de erro', async () => {
      for (const [method, url] of [['GET', '/nao/existe'], ['PUT', '/health'], ['DELETE', '/projetos/x']] as const) {
        const resposta = await ctx.app.inject({ method, url });
        expect(resposta.statusCode).toBe(404);
        expect(resposta.json()).toEqual({ erro: 'NAO_ENCONTRADO', mensagem: `Rota ${method} ${url} não existe` });
      }
    });

    it('parâmetro de URL longo demais responde 414 no mesmo formato de erro', async () => {
      const resposta = await ctx.app.inject(`/recomendacoes/${'a'.repeat(500)}`);
      expect(resposta.statusCode).toBe(414);
      expect(Object.keys(resposta.json()).sort()).toEqual(['erro', 'mensagem']);
      expect(resposta.json().erro).toBe('REQUISICAO_INVALIDA');
    });

    it('500 genérico (sem vazar detalhes) para falhas inesperadas', async () => {
      ctx.projetos.falharComErroGenerico = true;
      const resposta = await ctx.app.inject({ method: 'POST', url: '/projetos/recomendar', payload: corpoProjeto });
      expect(resposta.statusCode).toBe(500);
      expect(resposta.json()).toEqual({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno inesperado; tente novamente.' });
    });
  });

  it('suporta 100 requisições simultâneas', async () => {
    const respostas = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        ctx.app.inject({ method: 'POST', url: '/projetos/recomendar', payload: { ...corpoProjeto, titulo: `Projeto ${i}` } }),
      ),
    );
    expect(respostas.every((r) => r.statusCode === 201)).toBe(true);
    expect(ctx.projetos.projetos.size).toBe(100);
  });
});
