import { gerarCodigoDeAcesso, hashDoCodigo, resumoSha256 } from '../seguranca.js';
import { validarEmail } from '../validacao.js';
import { registrar } from '../registro.js';
import { montarLinkDeAcesso } from './link-de-acesso.js';

/** A resposta é sempre a mesma, exista compra ou não (evita descobrir quem comprou). */
export const MENSAGEM_DE_REENVIO =
  'Se existir uma compra aprovada com esse e-mail, enviamos um novo link de acesso. Confira também o spam.';

/**
 * Caso de uso: "não recebi meu e-mail" / "perdi meu link".
 *
 * Gera um código novo (o antigo para de funcionar) e manda para o e-mail da
 * compra. Só quem tem acesso àquele e-mail recebe o link.
 */
export function criarCasoReenviarAcesso({ pedidos, email, limitador, urlDoSite }) {
  return async function reenviarAcesso({ email: emailDigitado, visitante }) {
    await limitador.exigir(`reenvio-visitante:${visitante}`, 5, 60 * 60);
    const emailLimpo = validarEmail(emailDigitado);
    await limitador.exigir(`reenvio-email:${resumoSha256(emailLimpo)}`, 3, 60 * 60);

    const pedido = await pedidos.buscarAprovadoPorEmail(emailLimpo);
    if (pedido) {
      const codigo = gerarCodigoDeAcesso();
      await pedidos.trocarCodigo({ id: pedido.id, hashDoCodigo: hashDoCodigo(codigo) });
      await email.enviarLinkDeAcesso({
        para: pedido.email,
        nome: pedido.nome,
        link: montarLinkDeAcesso(urlDoSite, codigo),
      });
      await pedidos.marcarEmailEnviado(pedido.id);
      registrar('info', 'acesso-reenviado', { pedido: pedido.id });
    }

    return { mensagem: MENSAGEM_DE_REENVIO };
  };
}
