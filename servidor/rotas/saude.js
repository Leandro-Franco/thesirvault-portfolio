import { criarRota, responderJson } from '../http.js';
import { obterDependencias } from '../dependencias.js';

/**
 * GET /api/saude
 * Para um monitor externo (ex.: UptimeRobot) conferir a cada poucos minutos se
 * a loja está vendendo: o Worker roda, o banco responde e as vendas estão
 * abertas (Mercado Pago e e-mail cadastrados).
 *
 * Resposta: 200 { situacao: "ok" } ou 503 { situacao: "com-problema" }.
 * Não diz qual parte falhou: o detalhe fica nos logs e no e-mail de alerta.
 */
export default criarRota('saude', async (_requisicao, env) => {
  const funcionando = await obterDependencias(env).lojaFuncionando();
  return funcionando ? responderJson({ situacao: 'ok' }) : responderJson({ situacao: 'com-problema' }, 503);
});
