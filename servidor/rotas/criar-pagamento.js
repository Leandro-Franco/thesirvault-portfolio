import { criarRota, exigirMesmaOrigem, ipDoCliente, lerCorpoJson, responderJson } from '../http.js';
import { obterDependencias } from '../dependencias.js';

/**
 * POST /api/criar-pagamento
 * Corpo: { nome, email, aceitouTermos }
 * Resposta: { enderecoDoCheckout }
 */
export default criarRota('criar-pagamento', async (requisicao, env) => {
  const { config, identificarVisitante, criarPedido } = obterDependencias(env);
  exigirMesmaOrigem(requisicao, config.urlDoSite);
  const corpo = await lerCorpoJson(requisicao);

  // Pegamos só os campos esperados, um por um (nada de repassar o corpo inteiro).
  const resultado = await criarPedido({
    nome: corpo.nome,
    email: corpo.email,
    aceitouTermos: corpo.aceitouTermos,
    visitante: identificarVisitante(ipDoCliente(requisicao)),
  });
  return responderJson(resultado);
});
