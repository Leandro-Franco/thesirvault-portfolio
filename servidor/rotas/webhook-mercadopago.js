import { criarRota, responderJson } from '../http.js';
import { obterDependencias } from '../dependencias.js';
import { ErroDeAssinatura, ErroDeServicoIndisponivel } from '../erros.js';
import { assinaturaDoMercadoPagoValida } from '../seguranca.js';
import { idDePagamentoValido } from '../validacao.js';
import { registrar } from '../registro.js';

/**
 * POST /api/webhook-mercadopago
 * Chamado pelo Mercado Pago quando um pagamento muda.
 * Exemplo: /api/webhook-mercadopago?data.id=123456&type=payment
 *
 * 0. Se o Mercado Pago ainda não foi cadastrado (pré-lançamento), responde 503.
 * 1. Confere a assinatura (x-signature): sem ela, recusa com 401.
 * 2. Ignora avisos que não são de pagamento.
 * 3. Processa o pagamento buscando os dados direto na API do Mercado Pago.
 *
 * Responde 200 quando terminou. Se der erro, responde 500 e o Mercado Pago
 * tenta de novo mais tarde (o processamento é seguro para repetir).
 */
export default criarRota('webhook-mercadopago', async (requisicao, env) => {
  const { config, processarPagamento } = obterDependencias(env);
  if (!config.mercadoPago) throw new ErroDeServicoIndisponivel();

  const parametros = new URL(requisicao.url).searchParams;
  const idDoRecurso = parametros.get('data.id') || '';
  const tipo = parametros.get('type') || parametros.get('topic') || '';

  const assinaturaValida = assinaturaDoMercadoPagoValida({
    cabecalhoAssinatura: requisicao.headers.get('x-signature'),
    idDaRequisicao: requisicao.headers.get('x-request-id'),
    idDoRecurso,
    segredo: config.mercadoPago.segredoDoWebhook,
  });
  if (!assinaturaValida) {
    registrar('alerta', 'webhook-assinatura-invalida', { tipo });
    throw new ErroDeAssinatura();
  }

  if (tipo !== 'payment' || !idDePagamentoValido(idDoRecurso)) {
    return responderJson({ recebido: true, ignorado: true });
  }

  const resultado = await processarPagamento({ idDoPagamento: idDoRecurso });
  return responderJson({ recebido: true, resultado });
});
