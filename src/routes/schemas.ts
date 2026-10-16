import { PAPEIS_TECNICOS, type TipoCaptacao, type TipoEstrategia } from '../domain/entities/Projeto';

export type SchemaJson = Record<string, unknown>;

const CAMPOS_SEMPRE_OBRIGATORIOS = ['titulo', 'produtorId', 'orcamentoTotal', 'dataEntrega', 'localizacao'];
const CAMPOS_OBRIGATORIOS_SEM_MODELO = ['genero', 'duracaoEstimadaMin', 'tipoCaptacao', 'papeis'];

const TEXTO_OBRIGATORIO = { type: 'string', minLength: 1 } as const;
const NUMERO_POSITIVO = { type: 'number', exclusiveMinimum: 0 } as const;
// Limites das colunas no banco: orçamento em Decimal(14,2) (abaixo de 10^12) e duração em INT4.
const ORCAMENTO = { ...NUMERO_POSITIVO, maximum: 999_999_999_999 } as const;
const DURACAO_MIN = { ...NUMERO_POSITIVO, maximum: 2_147_483_647 } as const;
const DATA_ISO = { type: 'string', minLength: 10 } as const;

export function schemaProjeto(tiposCaptacao: readonly TipoCaptacao[], tiposEstrategia: readonly TipoEstrategia[]): SchemaJson {
  return {
    type: 'object',
    required: CAMPOS_SEMPRE_OBRIGATORIOS,
    if: { required: ['modelo'] },
    then: {},
    else: { required: CAMPOS_OBRIGATORIOS_SEM_MODELO },
    properties: propriedadesProjeto(tiposCaptacao, tiposEstrategia),
  };
}

function propriedadesProjeto(tiposCaptacao: readonly TipoCaptacao[], tiposEstrategia: readonly TipoEstrategia[]): SchemaJson {
  return {
    modelo: TEXTO_OBRIGATORIO,
    titulo: TEXTO_OBRIGATORIO,
    produtorId: TEXTO_OBRIGATORIO,
    produtorEmail: { type: 'string' },
    genero: TEXTO_OBRIGATORIO,
    duracaoEstimadaMin: DURACAO_MIN,
    orcamentoTotal: ORCAMENTO,
    dataEntrega: DATA_ISO,
    tipoCaptacao: enumDeTexto(tiposCaptacao),
    localizacao: TEXTO_OBRIGATORIO,
    estrategia: enumDeTexto(tiposEstrategia),
    detalhes: { type: 'object' },
    papeis: { type: 'array', minItems: 1, items: schemaPapelRequerido() },
  };
}

function schemaPapelRequerido(): SchemaJson {
  return {
    type: 'object',
    required: ['papel', 'peso'],
    properties: {
      papel: enumDeTexto(PAPEIS_TECNICOS),
      peso: NUMERO_POSITIVO,
      competenciasDesejadas: { type: 'object', additionalProperties: { type: 'number', minimum: 0, maximum: 1 } },
    },
  };
}

export function schemaAlteracaoProjeto(tiposEstrategia: readonly TipoEstrategia[]): SchemaJson {
  return {
    type: 'object',
    minProperties: 1,
    properties: {
      orcamentoTotal: ORCAMENTO,
      dataEntrega: DATA_ISO,
      estrategia: enumDeTexto(tiposEstrategia),
      forcarReavaliacao: { type: 'boolean' },
    },
  };
}

export function schemaSubstituicao(tiposEstrategia: readonly TipoEstrategia[]): SchemaJson {
  return {
    type: ['object', 'null'],
    properties: { estrategia: enumDeTexto(tiposEstrategia) },
  };
}

export const schemaRespostaConvite: SchemaJson = {
  type: 'object',
  required: ['aceito'],
  properties: { aceito: { type: 'boolean' } },
};

export const schemaIdParams: SchemaJson = {
  type: 'object',
  required: ['id'],
  properties: { id: TEXTO_OBRIGATORIO },
};

export const schemaMembroParams: SchemaJson = {
  type: 'object',
  required: ['id', 'papel'],
  properties: { id: TEXTO_OBRIGATORIO, papel: enumDeTexto(PAPEIS_TECNICOS) },
};

function enumDeTexto(valores: readonly string[]): SchemaJson {
  return { type: 'string', enum: [...valores] };
}
