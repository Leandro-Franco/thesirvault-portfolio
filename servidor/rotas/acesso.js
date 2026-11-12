import { criarRota, exigirMesmaOrigem, ipDoCliente, lerCorpoJson, responderJson } from '../http.js';
import { obterDependencias } from '../dependencias.js';

/**
 * POST /api/acesso
 * Corpo: { codigo }
 * Resposta: { nome, arquivos: [{ id, titulo, descricao }] }
 *
 * É POST (e não GET com ?codigo=) para o código nunca aparecer em URLs e logs.
 */
export default criarRota('acesso', async (requisicao, env) => {
  const { config, identificarVisitante, consultarAcesso } = obterDependencias(env);
  exigirMesmaOrigem(requisicao, config.urlDoSite);
  const corpo = await lerCorpoJson(requisicao);

  const resultado = await consultarAcesso({
    codigo: corpo.codigo,
    visitante: identificarVisitante(ipDoCliente(requisicao)),
  });
  return responderJson(resultado);
});
