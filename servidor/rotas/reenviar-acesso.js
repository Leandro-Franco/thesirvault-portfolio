import { comDuracaoMinima, criarRota, exigirMesmaOrigem, ipDoCliente, lerCorpoJson, responderJson } from '../http.js';
import { obterDependencias } from '../dependencias.js';

/** Tempo mínimo de resposta: com ou sem compra, a resposta demora igual. */
const DURACAO_MINIMA_EM_MS = 1500;

/**
 * POST /api/reenviar-acesso
 * Corpo: { email }
 * Resposta: { mensagem }   sempre a mesma, exista compra ou não
 */
export default criarRota('reenviar-acesso', async (requisicao, env) => {
  const { config, identificarVisitante, reenviarAcesso } = obterDependencias(env);
  exigirMesmaOrigem(requisicao, config.urlDoSite);
  const corpo = await lerCorpoJson(requisicao);

  const resultado = await comDuracaoMinima(DURACAO_MINIMA_EM_MS, () =>
    reenviarAcesso({
      email: corpo.email,
      visitante: identificarVisitante(ipDoCliente(requisicao)),
    }),
  );
  return responderJson(resultado);
});
