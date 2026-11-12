import { chamarApi, ehEnderecoDoMercadoPago } from '../comum/api.js';

/**
 * Janela de compra: pede nome e e-mail, cria o pedido no nosso backend
 * e leva o cliente para o checkout do Mercado Pago.
 *
 * O preço NÃO sai daqui: o backend cobra o valor que está em
 * src/conteudo/pacote.js. Assim ninguém consegue mudar o preço pelo navegador.
 */
export function criarJanelaDeCompra(dialogo) {
  const formulario = dialogo.querySelector('form');
  const botaoEnviar = formulario.querySelector('[type="submit"]');
  const mensagemDeErro = formulario.querySelector('[data-erro]');
  const botaoFechar = dialogo.querySelector('[data-fechar]');

  botaoFechar.addEventListener('click', () => dialogo.close());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErro('');

    if (!formulario.reportValidity()) return;
    const dados = Object.fromEntries(new FormData(formulario));

    botaoEnviar.disabled = true;
    botaoEnviar.textContent = 'Abrindo o pagamento…';
    try {
      const { enderecoDoCheckout } = await chamarApi('criar-pagamento', {
        nome: dados.nome,
        email: dados.email,
        aceitouTermos: dados.aceitouTermos === 'sim',
      });

      if (!ehEnderecoDoMercadoPago(enderecoDoCheckout)) {
        throw new Error('Endereço de pagamento inesperado.');
      }
      location.assign(enderecoDoCheckout);
    } catch (erro) {
      mostrarErro(erro.message);
      botaoEnviar.disabled = false;
      botaoEnviar.textContent = 'Ir para o pagamento';
    }
  });

  function mostrarErro(texto) {
    mensagemDeErro.textContent = texto;
    mensagemDeErro.hidden = !texto;
  }

  return {
    abrir() {
      mostrarErro('');
      dialogo.showModal();
    },
  };
}
