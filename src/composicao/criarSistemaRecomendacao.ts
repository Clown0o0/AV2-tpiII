import type { ConviteRepository } from '../domain/ports/ConviteRepository';
import type { ProfissionalRepository } from '../domain/ports/ProfissionalRepository';
import type { ProjetoRepository } from '../domain/ports/ProjetoRepository';
import type { RecomendacaoRepository } from '../domain/ports/RecomendacaoRepository';
import type { PublicadorEventos } from '../events/PublicadorEventos';
import type { CatalogoFabricas } from '../factories/FabricaProjeto';
import { RegistroFabricas } from '../factories/RegistroFabricas';
import { OrquestradorPadrao } from '../orchestration/OrquestradorPadrao';
import { RegistroPrototipos, type CatalogoPrototipos } from '../prototypes/RegistroPrototipos';
import type { CriadorDeOrquestrador, Relogio } from '../services/contratos';
import { FonteProfissionaisResiliente, type OpcoesFonteResiliente } from '../services/FonteProfissionaisResiliente';
import { GeradorDeRelatorio } from '../services/GeradorDeRelatorio';
import { GestorDeConvites } from '../services/GestorDeConvites';
import { OrquestradorDeRecomendacao } from '../services/OrquestradorDeRecomendacao';
import { LIMIARES_PADRAO, PoliticaDeReavaliacao, type LimiaresReavaliacao } from '../services/PoliticaDeReavaliacao';
import { PublicadorDeEventosDeRecomendacao } from '../services/PublicadorDeEventosDeRecomendacao';
import { SistemaRecomendacao } from '../services/SistemaRecomendacao';
import type { CatalogoEstrategias } from '../strategies/RecomendacaoStrategy';
import { RegistroEstrategias } from '../strategies/RegistroEstrategias';
import { CompatibilidadeEquipeVisitor } from '../visitors/CompatibilidadeEquipeVisitor';

export type RepositorioDeProjetos = ProjetoRepository & RecomendacaoRepository & ConviteRepository;

export interface OpcoesSistemaRecomendacao {
  profissionais: ProfissionalRepository;
  projetos: RepositorioDeProjetos;
  eventos: PublicadorEventos;
  estrategias?: CatalogoEstrategias;
  fabricas?: CatalogoFabricas;
  prototipos?: CatalogoPrototipos;
  criarOrquestrador?: CriadorDeOrquestrador;
  relogio?: Relogio;
  limiares?: Partial<LimiaresReavaliacao>;
  opcoesFonte?: Partial<OpcoesFonteResiliente>;
}

type OpcoesCompletas = Required<Omit<OpcoesSistemaRecomendacao, 'limiares' | 'opcoesFonte'>> &
  Pick<OpcoesSistemaRecomendacao, 'opcoesFonte'> & { limiares: LimiaresReavaliacao };

// Raiz de composição: único lugar que escolhe as implementações concretas e os valores padrão.
export function criarSistemaRecomendacao(opcoes: OpcoesSistemaRecomendacao): SistemaRecomendacao {
  return montarSistema(completarComPadroes(opcoes));
}

function completarComPadroes(opcoes: OpcoesSistemaRecomendacao): OpcoesCompletas {
  return {
    ...opcoes,
    estrategias: opcoes.estrategias ?? RegistroEstrategias.padrao(),
    fabricas: opcoes.fabricas ?? RegistroFabricas.padrao(),
    prototipos: opcoes.prototipos ?? RegistroPrototipos.padrao(),
    criarOrquestrador: opcoes.criarOrquestrador ?? ((fabrica) => new OrquestradorPadrao(fabrica)),
    relogio: opcoes.relogio ?? ((): Date => new Date()),
    limiares: { ...LIMIARES_PADRAO, ...opcoes.limiares },
  };
}

function montarSistema(opcoes: OpcoesCompletas): SistemaRecomendacao {
  const { projetos, fabricas, estrategias, criarOrquestrador, relogio } = opcoes;
  const profissionais = new FonteProfissionaisResiliente(opcoes.profissionais, opcoes.opcoesFonte);
  return new SistemaRecomendacao({
    projetos,
    recomendacoes: projetos,
    profissionais,
    catalogoDeProfissionais: profissionais,
    fabricas,
    estrategias,
    prototipos: opcoes.prototipos,
    recomendador: new OrquestradorDeRecomendacao({ fabricas, estrategias, profissionais, criarOrquestrador, relogio }),
    convites: new GestorDeConvites(projetos, relogio),
    relatorios: new GeradorDeRelatorio(profissionais, () => new CompatibilidadeEquipeVisitor(), relogio),
    eventos: new PublicadorDeEventosDeRecomendacao(opcoes.eventos, relogio),
    reavaliacao: new PoliticaDeReavaliacao(opcoes.limiares),
    relogio,
  });
}
