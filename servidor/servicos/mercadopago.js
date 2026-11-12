/**
 * Adaptador do Mercado Pago (Checkout Pro), usando a API REST diretamente.
 * Sem SDK: menos dependências para manter e auditar.
 *
 * Qualquer outro meio de pagamento pode substituir este arquivo, desde que
 * ofereça as mesmas duas funções (criarCheckout e buscarPagamento).
 *
 * @typedef {object} ServicoDePagamentos
 * @property {(dados: DadosDoCheckout) => Promise<{ enderecoDoCheckout: string }>} criarCheckout
 * @property {(idDoPagamento: string) => Promise<Pagamento>} buscarPagamento
 *
 * @typedef {object} DadosDoCheckout
 * @property {{ id: string, nome: string, email: string, valorEmCentavos: number }} pedido
 * @property {string} titulo
 * @property {string} urlDoSite
 *
 * @typedef {object} Pagamento
 * @property {string} id
 * @property {'aprovado' | 'reembolsado' | 'outro'} situacao
 * @property {string} idDoPedido        a external_reference que mandamos
 * @property {number} valorEmCentavos
 * @property {string} moeda
 */

const API = 'https://api.mercadopago.com';
const TEMPO_LIMITE_EM_MS = 10_000;

/** Tradução das situações do Mercado Pago para as nossas. */
const SITUACOES = {
  approved: 'aprovado',
  refunded: 'reembolsado',
  charged_back: 'reembolsado', // estorno pelo cartão
};

/** @returns {ServicoDePagamentos} */
export function criarServicoDePagamentos({ tokenDeAcesso, buscar = globalThis.fetch }) {
  async function chamar(caminho, opcoes = {}) {
    const resposta = await buscar(`${API}${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${tokenDeAcesso}`,
        'Content-Type': 'application/json',
        ...opcoes.headers,
      },
      signal: AbortSignal.timeout(TEMPO_LIMITE_EM_MS),
    });
    if (!resposta.ok) {
      throw new Error(`Mercado Pago respondeu ${resposta.status} em ${caminho}`);
    }
    return resposta.json();
  }

  return {
    async criarCheckout({ pedido, titulo, urlDoSite }) {
      const preferencia = await chamar('/checkout/preferences', {
        method: 'POST',
        // Se a mesma requisição for repetida, o Mercado Pago não cria duas preferências.
        headers: { 'X-Idempotency-Key': pedido.id },
        body: JSON.stringify({
          items: [
            {
              id: 'the-sir-vault-vol-01',
              title: titulo,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: pedido.valorEmCentavos / 100,
            },
          ],
          payer: { name: pedido.nome, email: pedido.email },
          external_reference: pedido.id,
          // Sem notification_url de propósito: o aviso de pagamento vem do webhook
          // cadastrado no painel (Suas integrações → Webhooks), que é o que o
          // Mercado Pago documenta como assinado (x-signature). Uma notification_url
          // aqui teria prioridade sobre o painel, sem essa garantia.
          back_urls: {
            success: `${urlDoSite}/comprador?pagamento=aprovado`,
            pending: `${urlDoSite}/comprador?pagamento=pendente`,
            failure: `${urlDoSite}/comprador?pagamento=falhou`,
          },
          auto_return: 'approved',
          statement_descriptor: 'THESIRVAULT',
          // A preferência expira em 24 horas; depois disso o cliente faz um pedido novo.
          expires: true,
          expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      return { enderecoDoCheckout: preferencia.init_point };
    },

    async buscarPagamento(idDoPagamento) {
      const pagamento = await chamar(`/v1/payments/${encodeURIComponent(idDoPagamento)}`);
      return {
        id: String(pagamento.id),
        situacao: SITUACOES[pagamento.status] || 'outro',
        idDoPedido: pagamento.external_reference || '',
        valorEmCentavos: Math.round(Number(pagamento.transaction_amount) * 100),
        moeda: pagamento.currency_id,
      };
    },
  };
}
