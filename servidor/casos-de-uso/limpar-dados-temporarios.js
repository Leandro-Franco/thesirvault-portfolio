import { registrar } from '../registro.js';

/**
 * Caso de uso: limpeza diária, disparada pelo agendador da Cloudflare (cron
 * em wrangler.jsonc). Cumpre o que a política de privacidade promete:
 *
 * - Contagens de tentativas (com o IP embaralhado) somem depois de 1 dia.
 *   A maior janela em uso é de 1 hora, então 1 dia sobra.
 * - Pedidos que nunca foram pagos somem depois de 30 dias. O checkout do
 *   Mercado Pago expira em 24 horas e um boleto vence em poucos dias, então
 *   30 dias não apaga nenhuma compra que ainda possa ser paga.
 */
export const IDADE_MAXIMA_DAS_CONTAGENS_EM_SEGUNDOS = 24 * 60 * 60;
export const DIAS_PARA_APAGAR_PEDIDO_NAO_PAGO = 30;

export function criarCasoLimparDadosTemporarios({ pedidos, limitador, agora = () => new Date() }) {
  return async function limparDadosTemporarios() {
    const limite = new Date(agora().getTime() - DIAS_PARA_APAGAR_PEDIDO_NAO_PAGO * 24 * 60 * 60 * 1000);

    const contagensApagadas = await limitador.apagarJanelasAntigas(IDADE_MAXIMA_DAS_CONTAGENS_EM_SEGUNDOS);
    const pedidosApagados = await pedidos.apagarPendentesCriadosAntesDe(limite.toISOString());

    registrar('info', 'limpeza-diaria', { contagensApagadas, pedidosApagados });
    return { contagensApagadas, pedidosApagados };
  };
}
