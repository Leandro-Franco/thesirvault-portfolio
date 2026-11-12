import { ErroConhecido, ErroDeEntrada, ErroDeOrigem, ErroDeTamanho } from './erros.js';
import { registrar } from './registro.js';

/**
 * Ferramentas HTTP comuns a todas as rotas (pasta servidor/rotas).
 * As rotas usam a API padrão da web (Request e Response), a mesma do Worker.
 */

const TAMANHO_MAXIMO_DO_CORPO = 10 * 1024; // 10 KB é muito mais do que qualquer rota precisa

const CABECALHOS_PADRAO = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function responderJson(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: CABECALHOS_PADRAO });
}

/**
 * Envolve o código de uma rota com o tratamento de erros:
 * - erros conhecidos viram a resposta com o status e a mensagem deles;
 * - qualquer outro erro vira 500 com mensagem genérica, e o detalhe vai só para o log.
 */
export function criarRota(nome, tratar) {
  return async function rota(requisicao, env) {
    try {
      return await tratar(requisicao, env);
    } catch (erro) {
      if (erro instanceof ErroConhecido) {
        registrar('info', 'requisicao-recusada', { rota: nome, motivo: erro.name, status: erro.status });
        return responderJson({ erro: erro.message }, erro.status);
      }
      registrar('erro', 'falha-inesperada', { rota: nome, mensagem: erro?.message, pilha: erro?.stack });
      return responderJson({ erro: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
    }
  };
}

/** Lê o corpo como JSON, recusando corpos grandes ou que não sejam um objeto. */
export async function lerCorpoJson(requisicao) {
  const tamanhoDeclarado = Number(requisicao.headers.get('content-length') || 0);
  if (tamanhoDeclarado > TAMANHO_MAXIMO_DO_CORPO) throw new ErroDeTamanho();

  const tipo = requisicao.headers.get('content-type') || '';
  if (!tipo.startsWith('application/json')) throw new ErroDeEntrada('Envie os dados em JSON.');

  const texto = await requisicao.text();
  if (texto.length > TAMANHO_MAXIMO_DO_CORPO) throw new ErroDeTamanho();

  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroDeEntrada('JSON inválido.');
  }
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroDeEntrada('Formato inválido.');
  }
  return corpo;
}

/**
 * Proteção contra CSRF: só aceitamos POSTs vindos do nosso próprio site.
 * Navegadores sempre mandam o cabeçalho Origin em POSTs feitos por fetch().
 */
export function exigirMesmaOrigem(requisicao, urlDoSite) {
  const origem = requisicao.headers.get('origin');
  if (origem !== urlDoSite) throw new ErroDeOrigem();
}

/**
 * IP do visitante. Na Cloudflare, o cabeçalho cf-connecting-ip é escrito pela
 * própria plataforma (se o visitante mandar um falso, ele é substituído).
 */
export function ipDoCliente(requisicao) {
  return requisicao.headers.get('cf-connecting-ip') || 'desconhecido';
}

/**
 * Faz a resposta demorar sempre pelo menos `milissegundos`.
 * Usado onde o tempo de resposta poderia revelar se um e-mail tem compra ou não.
 */
export async function comDuracaoMinima(milissegundos, tarefa) {
  const inicio = Date.now();
  try {
    return await tarefa();
  } finally {
    const restante = milissegundos - (Date.now() - inicio);
    if (restante > 0) await new Promise((resolver) => setTimeout(resolver, restante));
  }
}
