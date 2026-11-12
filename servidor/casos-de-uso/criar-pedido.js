import { pacote } from '../../src/conteudo/pacote.js';
import { validarAceiteDosTermos, validarEmail, validarNome } from '../validacao.js';
import { registrar, mascararEmail } from '../registro.js';

/**
 * Caso de uso: o visitante clicou em "Ir para o pagamento".
 *
 * 1. Limita tentativas por visitante (contra robôs criando pedidos em massa).
 * 2. Valida nome, e-mail e aceite dos termos.
 * 3. Cria o pedido "pendente" com o preço do pacote. O preço vem SEMPRE daqui,
 *    nunca do navegador.
 * 4. Cria o checkout no Mercado Pago e devolve o endereço dele.
 *
 * As dependências chegam por parâmetro (inversão de dependência), então nos
 * testes trocamos o banco e o Mercado Pago por versões falsas.
 */
export function criarCasoCriarPedido({ pedidos, pagamentos, limitador, urlDoSite }) {
  return async function criarPedido({ nome, email, aceitouTermos, visitante }) {
    await limitador.exigir(`criar-pedido:${visitante}`, 10, 60 * 60);

    const dados = {
      nome: validarNome(nome),
      email: validarEmail(email),
    };
    validarAceiteDosTermos(aceitouTermos);

    const pedido = await pedidos.criar({ ...dados, valorEmCentavos: pacote.precoEmCentavos });
    const { enderecoDoCheckout } = await pagamentos.criarCheckout({
      pedido,
      titulo: `${pacote.nome} ${pacote.volume} · ${pacote.artista}`,
      urlDoSite,
    });

    registrar('info', 'pedido-criado', { pedido: pedido.id, email: mascararEmail(pedido.email) });
    return { enderecoDoCheckout };
  };
}
