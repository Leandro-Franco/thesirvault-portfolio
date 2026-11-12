/**
 * Conversa com o nosso backend (o Worker em servidor/, rotas /api/*).
 *
 * Toda chamada é um POST com JSON. Se o servidor responder com erro, lançamos
 * um ErroDaApi com a mensagem que o servidor mandou, já pronta para mostrar
 * ao visitante (o servidor nunca manda detalhes técnicos nessas mensagens).
 */

export class ErroDaApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = 'ErroDaApi';
    this.status = status;
  }
}

const MENSAGEM_GENERICA = 'Não foi possível concluir agora. Tente de novo em instantes.';

export async function chamarApi(rota, dados) {
  let resposta;
  try {
    resposta = await fetch(`/api/${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroDaApi('Sem conexão com o servidor. Verifique sua internet.', 0);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroDaApi(corpo.erro || MENSAGEM_GENERICA, resposta.status);
  }
  return corpo;
}

/**
 * Só deixamos o navegador ir para o checkout se o endereço for mesmo do
 * Mercado Pago. Isso impede que uma resposta adulterada leve o cliente
 * para um site falso (redirecionamento aberto).
 */
export function ehEnderecoDoMercadoPago(endereco) {
  try {
    const url = new URL(endereco);
    const dominioPermitido = url.hostname === 'mercadopago.com.br' || url.hostname.endsWith('.mercadopago.com.br');
    return url.protocol === 'https:' && dominioPermitido;
  } catch {
    return false;
  }
}
