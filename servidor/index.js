import criarPagamento from './rotas/criar-pagamento.js';
import acesso from './rotas/acesso.js';
import linkDownload from './rotas/link-download.js';
import baixar from './rotas/baixar.js';
import reenviarAcesso from './rotas/reenviar-acesso.js';
import webhookMercadoPago from './rotas/webhook-mercadopago.js';
import saude from './rotas/saude.js';
import { responderJson } from './http.js';
import { obterDependencias } from './dependencias.js';
import { retirarAlertas } from './registro.js';

/**
 * Ponto de entrada do Cloudflare Worker.
 *
 * - Endereços /api/* passam pelo Worker e caem numa das rotas abaixo.
 * - Todo o resto (páginas, JS, CSS) são arquivos estáticos da pasta dist/,
 *   servidos direto pela Cloudflare, com os cabeçalhos de public/_headers.
 *
 * Cada rota aceita um único método HTTP. Qualquer outro recebe 405.
 *
 * `scheduled` roda uma vez por dia (veja "triggers" em wrangler.jsonc) e apaga
 * dados temporários que não precisam mais existir.
 *
 * Depois de responder, o Worker manda por e-mail os alertas que a requisição
 * registrou (ctx.waitUntil deixa o envio terminar sem atrasar a resposta).
 */
const ROTAS = {
  '/api/criar-pagamento': { metodo: 'POST', tratar: criarPagamento },
  '/api/acesso': { metodo: 'POST', tratar: acesso },
  '/api/link-download': { metodo: 'POST', tratar: linkDownload },
  '/api/baixar': { metodo: 'GET', tratar: baixar },
  '/api/reenviar-acesso': { metodo: 'POST', tratar: reenviarAcesso },
  '/api/webhook-mercadopago': { metodo: 'POST', tratar: webhookMercadoPago },
  '/api/saude': { metodo: 'GET', tratar: saude },
};

export default {
  async fetch(requisicao, env, ctx) {
    const { pathname } = new URL(requisicao.url);

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(requisicao);
    }

    const rota = ROTAS[pathname];
    if (!rota) {
      return responderJson({ erro: 'Endereço não encontrado.' }, 404);
    }
    if (requisicao.method !== rota.metodo) {
      const resposta = responderJson({ erro: 'Método não permitido.' }, 405);
      resposta.headers.set('Allow', rota.metodo);
      return resposta;
    }
    const resposta = await rota.tratar(requisicao, env);
    ctx?.waitUntil(enviarAlertas(env));
    return resposta;
  },

  async scheduled(_agendamento, env, ctx) {
    try {
      await obterDependencias(env).limparDadosTemporarios();
    } finally {
      ctx?.waitUntil(enviarAlertas(env));
    }
  },
};

/** Nunca falha: se nem a configuração carrega, os alertas ficam só no log. */
async function enviarAlertas(env) {
  try {
    await obterDependencias(env).enviarAlertas();
  } catch {
    retirarAlertas();
  }
}
