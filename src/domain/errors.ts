// Cada erro de domínio sabe o próprio status HTTP: um erro novo não exige mudar a camada HTTP.
export abstract class ErroDominio extends Error {
  abstract readonly codigo: string;
  abstract readonly codigoHttp: number;

  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class ErroValidacao extends ErroDominio {
  readonly codigo = 'VALIDACAO';
  readonly codigoHttp = 422;
}

export class ErroNaoEncontrado extends ErroDominio {
  readonly codigo = 'NAO_ENCONTRADO';
  readonly codigoHttp = 404;
}

export class ErroEstadoInvalido extends ErroDominio {
  readonly codigo = 'ESTADO_INVALIDO';
  readonly codigoHttp = 409;
}
