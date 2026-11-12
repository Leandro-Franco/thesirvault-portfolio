import { ErroDeServicoIndisponivel } from '../erros.js';

/**
 * Peças usadas no lugar dos serviços que ainda não foram ligados.
 *
 * O site pode ir ao ar antes de o Mercado Pago e o e-mail estarem
 * cadastrados. Em vez de quebrar com erro 500, cada parte que depende deles
 * responde 503 com uma mensagem clara. Quando o segredo for cadastrado, a
 * peça real entra no lugar sozinha (veja servidor/dependencias.js).
 */

export const MENSAGEM_VENDAS_EM_BREVE = 'As vendas abrem em breve. Volte daqui a pouco!';
export const MENSAGEM_REENVIO_EM_BREVE = 'O reenvio de link ainda não está disponível. Volte em breve.';

/** Caso de uso que só avisa que ainda não está disponível. */
export function casoAindaIndisponivel(mensagem) {
  return async function aindaIndisponivel() {
    throw new ErroDeServicoIndisponivel(mensagem);
  };
}
