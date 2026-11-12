import { criarRota, exigirMesmaOrigem, ipDoCliente, lerCorpoJson, responderJson } from '../http.js';
import { obterDependencias } from '../dependencias.js';

/**
 * POST /api/link-download
 * Corpo: { codigo, arquivo }   arquivo = "presets" | "projects" | "drums" | "videoaulas"
 * Resposta: { endereco }       link assinado para /api/baixar, válido por 1 hora
 */
export default criarRota('link-download', async (requisicao, env) => {
  const { config, identificarVisitante, gerarLinkDeDownload } = obterDependencias(env);
  exigirMesmaOrigem(requisicao, config.urlDoSite);
  const corpo = await lerCorpoJson(requisicao);

  const resultado = await gerarLinkDeDownload({
    codigo: corpo.codigo,
    arquivo: corpo.arquivo,
    visitante: identificarVisitante(ipDoCliente(requisicao)),
  });
  return responderJson(resultado);
});
