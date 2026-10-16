import { ErroDominio, ErroEstadoInvalido, ErroNaoEncontrado, ErroValidacao } from '../../../src/domain/errors';
import {
  schemaAlteracaoProjeto,
  schemaMembroParams,
  schemaProjeto,
  schemaSubstituicao,
} from '../../../src/routes/schemas';

describe('schemas das rotas', () => {
  it('o schema do projeto usa os tipos e estratégias recebidos e exige campos completos sem modelo', () => {
    const schema = schemaProjeto(['FICCAO'], ['COSSENO']);
    expect(schema).toMatchObject({
      required: ['titulo', 'produtorId', 'orcamentoTotal', 'dataEntrega', 'localizacao'],
      if: { required: ['modelo'] },
      else: { required: ['genero', 'duracaoEstimadaMin', 'tipoCaptacao', 'papeis'] },
      properties: {
        tipoCaptacao: { type: 'string', enum: ['FICCAO'] },
        estrategia: { type: 'string', enum: ['COSSENO'] },
        papeis: { type: 'array', minItems: 1, items: { required: ['papel', 'peso'] } },
      },
    });
  });

  it('alteração e substituição aceitam só as estratégias informadas', () => {
    expect(schemaAlteracaoProjeto(['ORCAMENTO_REDUZIDO'])).toMatchObject({
      minProperties: 1,
      properties: { estrategia: { enum: ['ORCAMENTO_REDUZIDO'] } },
    });
    expect(schemaSubstituicao(['COSSENO'])).toEqual({
      type: ['object', 'null'],
      properties: { estrategia: { type: 'string', enum: ['COSSENO'] } },
    });
    expect(schemaMembroParams).toMatchObject({ required: ['id', 'papel'] });
  });
});

describe('erros de domínio', () => {
  it('cada erro informa o próprio código e status HTTP', () => {
    const erros: ErroDominio[] = [new ErroValidacao('v'), new ErroNaoEncontrado('n'), new ErroEstadoInvalido('e')];
    expect(erros.map((e) => [e.codigo, e.codigoHttp, e.name])).toEqual([
      ['VALIDACAO', 422, 'ErroValidacao'],
      ['NAO_ENCONTRADO', 404, 'ErroNaoEncontrado'],
      ['ESTADO_INVALIDO', 409, 'ErroEstadoInvalido'],
    ]);
  });
});
