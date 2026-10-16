import type { Convite } from '../domain/entities/Convite';
import type {
  AjustesProjeto,
  AlteracoesProjeto,
  DadosProjeto,
  PapelTecnico,
  Projeto,
  ResultadoAlteracao,
  TipoCaptacao,
  TipoEstrategia,
} from '../domain/entities/Projeto';
import type { Profissional } from '../domain/entities/Profissional';
import type { MembroRecomendadoLeitura, Recomendacao } from '../domain/entities/Recomendacao';
import { ErroEstadoInvalido, ErroNaoEncontrado, ErroValidacao } from '../domain/errors';
import type { CicloDeVidaDoCatalogo, FonteDeProfissionais, OrigemDosProfissionais } from '../domain/ports/FonteDeProfissionais';
import type { ProjetoRepository } from '../domain/ports/ProjetoRepository';
import type { RecomendacaoRepository } from '../domain/ports/RecomendacaoRepository';
import type { CatalogoFabricas } from '../factories/FabricaProjeto';
import type { CatalogoPrototipos } from '../prototypes/RegistroPrototipos';
import type { CatalogoEstrategias } from '../strategies/RecomendacaoStrategy';
import type { Relogio } from './contratos';
import type { GeracaoDeRelatorio, RelatorioCompleto } from './GeradorDeRelatorio';
import type { ServicoDeConvites } from './GestorDeConvites';
import type { EquipeRecomendada, RecomendadorDeEquipes } from './OrquestradorDeRecomendacao';
import type { CriterioDeReavaliacao } from './PoliticaDeReavaliacao';
import type { EventosDeRecomendacao, MotivoDaRecomendacao } from './PublicadorDeEventosDeRecomendacao';

export interface DependenciasSistemaRecomendacao {
  projetos: ProjetoRepository;
  recomendacoes: RecomendacaoRepository;
  profissionais: FonteDeProfissionais;
  catalogoDeProfissionais: CicloDeVidaDoCatalogo;
  fabricas: CatalogoFabricas;
  estrategias: CatalogoEstrategias;
  prototipos: CatalogoPrototipos;
  recomendador: RecomendadorDeEquipes;
  convites: ServicoDeConvites;
  relatorios: GeracaoDeRelatorio;
  eventos: EventosDeRecomendacao;
  reavaliacao: CriterioDeReavaliacao;
  relogio: Relogio;
}

export interface ResultadoRecomendacao {
  projeto: Projeto;
  recomendacao: Recomendacao;
  fonteProfissionais: OrigemDosProfissionais;
}

export interface ResultadoAlteracaoProjeto {
  projeto: Projeto;
  alteracao: ResultadoAlteracao;
  reavaliada: boolean;
  recomendacao: Recomendacao | null;
}

export interface ResultadoRespostaConvite {
  convite: Convite;
  recomendacao: Recomendacao;
  equipeFinalizada: boolean;
}

interface RecomendacaoEProjeto {
  recomendacao: Recomendacao;
  projeto: Projeto;
}

// Fachada dos casos de uso: carrega, delega aos colaboradores, salva e publica os eventos.
export class SistemaRecomendacao {
  constructor(private readonly deps: DependenciasSistemaRecomendacao) {}

  recomendar(dados: DadosProjeto): Promise<ResultadoRecomendacao> {
    return this.recomendarProjeto(this.deps.fabricas.obter(dados.tipoCaptacao).criarProjeto(dados));
  }

  recomendarAPartirDoModelo(modelo: string, ajustes: AjustesProjeto & { tipoCaptacao?: TipoCaptacao }): Promise<ResultadoRecomendacao> {
    const { tipoCaptacao, ...resto } = ajustes;
    const projeto = this.deps.prototipos.criarAPartirDe(modelo, resto);
    if (tipoCaptacao !== undefined && tipoCaptacao !== projeto.tipoCaptacao) {
      throw new ErroValidacao(`O modelo ${modelo} é do tipo ${projeto.tipoCaptacao}, não ${tipoCaptacao}`);
    }
    return this.recomendarProjeto(projeto);
  }

  tiposCaptacao(): TipoCaptacao[] {
    return this.deps.fabricas.tipos();
  }

  tiposEstrategia(): TipoEstrategia[] {
    return this.deps.estrategias.tipos();
  }

  modelos(): string[] {
    return this.deps.prototipos.chaves();
  }

  async obterRecomendacaoComConvites(id: string): Promise<{ recomendacao: Recomendacao; convites: Convite[] }> {
    const recomendacao = await this.obterRecomendacao(id);
    return { recomendacao, convites: await this.deps.convites.listar(id) };
  }

  async aceitarMembro(recomendacaoId: string, papel: PapelTecnico): Promise<{ recomendacao: Recomendacao; convite: Convite }> {
    const { recomendacao, projeto } = await this.obterRecomendacaoEProjeto(recomendacaoId);
    const membro = recomendacao.convidar(papel);
    await this.deps.recomendacoes.salvarRecomendacao(recomendacao);
    const convite = await this.deps.convites.criar(recomendacaoId, projeto.id, membro);
    this.deps.eventos.interesseDoProdutor(projeto, convite, await this.buscarProfissional(membro.profissionalId));
    return { recomendacao, convite };
  }

  async rejeitarMembro(recomendacaoId: string, papel: PapelTecnico): Promise<Recomendacao> {
    const { recomendacao, projeto } = await this.obterRecomendacaoEProjeto(recomendacaoId);
    const membro = recomendacao.rejeitar(papel);
    await this.deps.convites.cancelarPendentes(recomendacaoId, membro);
    recomendacao.registrarResultadoRodada(true, [...recomendacao.avisos, `Papel ${papel} em aberto após rejeição`]);
    await this.deps.recomendacoes.salvarRecomendacao(recomendacao);
    this.deps.eventos.membroRejeitado(projeto, recomendacaoId, papel, membro.profissionalId);
    return recomendacao;
  }

  async substituirMembro(
    recomendacaoId: string,
    papel: PapelTecnico,
    estrategia?: TipoEstrategia,
  ): Promise<{ recomendacao: Recomendacao; novoMembro: MembroRecomendadoLeitura | null }> {
    const { recomendacao, projeto } = await this.obterRecomendacaoEProjeto(recomendacaoId);
    projeto.papelRequerido(papel);
    const estrategiaDaRodada = this.deps.estrategias.obter(estrategia ?? recomendacao.estrategia);
    const anterior = recomendacao.substituir(papel);
    if (anterior) await this.deps.convites.cancelarPendentes(recomendacaoId, anterior);
    const substituto = await this.deps.recomendador.recomendarSubstituto(projeto, recomendacao, papel, estrategiaDaRodada);
    await this.deps.recomendacoes.salvarRecomendacao(recomendacao);
    const anteriorId = anterior?.profissionalId ?? null;
    this.deps.eventos.membroSubstituido(projeto, recomendacao, { papel, anteriorId, ...substituto });
    return { recomendacao, novoMembro: substituto.novoMembro };
  }

  async responderConvite(conviteId: string, aceito: boolean): Promise<ResultadoRespostaConvite> {
    const convite = await this.deps.convites.obter(conviteId);
    const { recomendacao, projeto } = await this.obterRecomendacaoEProjeto(convite.recomendacaoId);
    await this.deps.convites.responder(convite, recomendacao, aceito);
    await this.deps.recomendacoes.salvarRecomendacao(recomendacao);
    this.deps.eventos.conviteRespondido(projeto, convite, aceito, await this.buscarProfissional(convite.profissionalId));
    const equipeFinalizada = aceito && recomendacao.equipeConsensual(projeto.papeis.map((p) => p.papel));
    if (equipeFinalizada) await this.finalizarEquipe(projeto, recomendacao);
    return { convite, recomendacao, equipeFinalizada };
  }

  async alterarProjeto(
    projetoId: string,
    alteracoes: AlteracoesProjeto & { forcarReavaliacao?: boolean },
  ): Promise<ResultadoAlteracaoProjeto> {
    const projeto = await this.obterProjeto(projetoId);
    const vigente = await this.obterRecomendacaoVigenteAlteravel(projetoId);
    if (alteracoes.estrategia) this.deps.estrategias.obter(alteracoes.estrategia);
    const alteracao = projeto.alterar(alteracoes);
    const reavaliada = this.deps.reavaliacao.deveReavaliar(alteracao, alteracoes.forcarReavaliacao === true);
    const nova = reavaliada ? await this.deps.recomendador.recomendarEquipe(projeto) : null;
    await this.deps.projetos.salvar(projeto);
    const recomendacao = nova ? await this.trocarRecomendacaoVigente(projeto, vigente, nova) : vigente;
    this.deps.eventos.projetoAlterado(projeto, alteracao, reavaliada);
    return { projeto, alteracao, reavaliada, recomendacao };
  }

  async gerarRelatorio(recomendacaoId: string): Promise<RelatorioCompleto> {
    const { recomendacao, projeto } = await this.obterRecomendacaoEProjeto(recomendacaoId);
    return this.deps.relatorios.gerar(projeto, recomendacao, this.deps.fabricas.obter(projeto.tipoCaptacao));
  }

  iniciarCatalogo(): Promise<void> {
    return this.deps.catalogoDeProfissionais.iniciar();
  }

  encerrarCatalogo(): void {
    this.deps.catalogoDeProfissionais.parar();
  }

  private async recomendarProjeto(projeto: Projeto): Promise<ResultadoRecomendacao> {
    const equipe = await this.deps.recomendador.recomendarEquipe(projeto);
    await this.deps.projetos.salvar(projeto);
    await this.salvarEPublicarRecomendacao(projeto, equipe, 'INICIAL');
    return { projeto, recomendacao: equipe.recomendacao, fonteProfissionais: equipe.fonte };
  }

  private async trocarRecomendacaoVigente(projeto: Projeto, vigente: Recomendacao | null, nova: EquipeRecomendada): Promise<Recomendacao> {
    if (vigente) {
      await this.deps.convites.cancelarPendentes(vigente.id);
      vigente.tornarObsoleta();
      await this.deps.recomendacoes.salvarRecomendacao(vigente);
    }
    await this.salvarEPublicarRecomendacao(projeto, nova, 'REAVALIACAO');
    return nova.recomendacao;
  }

  private async salvarEPublicarRecomendacao(projeto: Projeto, equipe: EquipeRecomendada, motivo: MotivoDaRecomendacao): Promise<void> {
    await this.deps.recomendacoes.salvarRecomendacao(equipe.recomendacao);
    this.deps.eventos.recomendacaoGerada(projeto, equipe.recomendacao, motivo, equipe.fonte, equipe.sugeridos);
  }

  private async finalizarEquipe(projeto: Projeto, recomendacao: Recomendacao): Promise<void> {
    recomendacao.finalizar(this.deps.relogio());
    await this.deps.recomendacoes.salvarRecomendacao(recomendacao);
    this.deps.eventos.equipeFinalizada(projeto, recomendacao);
  }

  private async buscarProfissional(id: string): Promise<Profissional | null> {
    const { profissionais } = await this.deps.profissionais.buscarPorIds([id]);
    return profissionais[0] ?? null;
  }

  private async obterRecomendacaoVigenteAlteravel(projetoId: string): Promise<Recomendacao | null> {
    const vigente = await this.deps.recomendacoes.buscarRecomendacaoVigente(projetoId);
    if (vigente?.status === 'FINALIZADA') {
      throw new ErroEstadoInvalido('A equipe deste projeto já foi finalizada e não pode ser reavaliada');
    }
    return vigente;
  }

  private async obterProjeto(id: string): Promise<Projeto> {
    const projeto = await this.deps.projetos.buscarPorId(id);
    if (!projeto) throw new ErroNaoEncontrado(`Projeto ${id} não encontrado`);
    return projeto;
  }

  private async obterRecomendacao(id: string): Promise<Recomendacao> {
    const recomendacao = await this.deps.recomendacoes.buscarRecomendacao(id);
    if (!recomendacao) throw new ErroNaoEncontrado(`Recomendação ${id} não encontrada`);
    return recomendacao;
  }

  private async obterRecomendacaoEProjeto(recomendacaoId: string): Promise<RecomendacaoEProjeto> {
    const recomendacao = await this.obterRecomendacao(recomendacaoId);
    return { recomendacao, projeto: await this.obterProjeto(recomendacao.projetoId) };
  }
}
