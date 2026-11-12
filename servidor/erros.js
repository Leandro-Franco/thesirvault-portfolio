/**
 * Erros "esperados" do sistema. Cada um já sabe o status HTTP e a mensagem
 * que pode ser mostrada ao visitante. Qualquer outro erro vira um 500 genérico,
 * sem detalhes técnicos na resposta (os detalhes vão só para o log).
 */

export class ErroConhecido extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = this.constructor.name;
    this.status = status;
  }
}

/** Dados enviados estão errados ou incompletos. */
export class ErroDeEntrada extends ErroConhecido {
  constructor(mensagem = 'Confira os dados enviados.') {
    super(mensagem, 400);
  }
}

/** Link pessoal inválido, revogado ou de pedido não aprovado. Mensagem igual para todos os casos. */
export class ErroDeAcesso extends ErroConhecido {
  constructor() {
    super('Este link de acesso não é válido.', 404);
  }
}

/** Muitas tentativas num intervalo curto. */
export class ErroDeLimite extends ErroConhecido {
  constructor() {
    super('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429);
  }
}

/** Requisição veio de outro site (proteção contra CSRF). */
export class ErroDeOrigem extends ErroConhecido {
  constructor() {
    super('Origem não permitida.', 403);
  }
}

/** Assinatura do webhook não confere. */
export class ErroDeAssinatura extends ErroConhecido {
  constructor() {
    super('Assinatura inválida.', 401);
  }
}

/** Corpo grande demais. */
export class ErroDeTamanho extends ErroConhecido {
  constructor() {
    super('Requisição grande demais.', 413);
  }
}

/** Link de download vencido, adulterado ou de pedido sem acesso. */
export class ErroDeLinkDeDownload extends ErroConhecido {
  constructor() {
    super('Este link de download expirou. Gere um novo na sua página de arquivos.', 410);
  }
}

/** Parte da loja que ainda não foi ligada (pré-lançamento: falta cadastrar o serviço). */
export class ErroDeServicoIndisponivel extends ErroConhecido {
  constructor(mensagem = 'Isto ainda não está disponível. Volte em breve.') {
    super(mensagem, 503);
  }
}
