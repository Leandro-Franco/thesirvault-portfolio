import { criarRota, ipDoCliente } from '../http.js';
import { obterDependencias } from '../dependencias.js';
import { ErroConhecido } from '../erros.js';

/**
 * GET /api/baixar?pedido=…&arquivo=…&expira=…&assinatura=…
 *
 * É o link que o botão "Baixar" abre. Confere o link assinado e manda o
 * arquivo do R2 direto para o navegador, em streaming (o Worker não carrega
 * o arquivo inteiro na memória). Aceita Range, então um download
 * interrompido pode continuar de onde parou.
 *
 * Se o link não valer mais, leva o cliente de volta para a página dele com
 * um aviso, em vez de mostrar um erro técnico.
 */
export default criarRota('baixar', async (requisicao, env) => {
  const { config, identificarVisitante, baixarArquivo } = obterDependencias(env);

  let resultado;
  try {
    resultado = await baixarArquivo({
      parametros: new URL(requisicao.url).searchParams,
      cabecalhos: requisicao.headers,
      visitante: identificarVisitante(ipDoCliente(requisicao)),
    });
  } catch (erro) {
    if (erro instanceof ErroConhecido) {
      return Response.redirect(`${config.urlDoSite}/comprador?download=expirado`, 303);
    }
    throw erro;
  }

  const { conteudo, nomeDoArquivo } = resultado;
  const cabecalhos = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${nomeDoArquivo}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Accept-Ranges': 'bytes',
    ETag: conteudo.httpEtag,
  });

  const trecho = trechoPedido(conteudo, requisicao.headers.has('range'));
  if (trecho) {
    cabecalhos.set('Content-Range', `bytes ${trecho.inicio}-${trecho.fim}/${conteudo.size}`);
    cabecalhos.set('Content-Length', String(trecho.fim - trecho.inicio + 1));
    return new Response(conteudo.body, { status: 206, headers: cabecalhos });
  }

  cabecalhos.set('Content-Length', String(conteudo.size));
  return new Response(conteudo.body, { status: 200, headers: cabecalhos });
});

/**
 * Quando o navegador pede só um pedaço (cabeçalho Range), o R2 devolve em
 * `conteudo.range` qual pedaço mandou. Aqui transformamos isso em
 * "do byte X ao byte Y".
 *
 * Cuidados que vieram de testar com o R2 de verdade:
 * - O objeto pode ter as chaves offset, length e suffix com valor undefined,
 *   então conferimos se cada uma é número, e não só se a chave existe.
 * - Um Range inválido ou fora do arquivo é ignorado pelo R2, que manda o
 *   arquivo inteiro. Nesse caso respondemos 200 normal, e não 206.
 */
export function trechoPedido(conteudo, pediuTrecho) {
  const { range, size } = conteudo;
  if (!pediuTrecho || !range) return null;

  let inicio;
  let tamanho;
  if (typeof range.suffix === 'number') {
    tamanho = Math.min(range.suffix, size);
    inicio = size - tamanho;
  } else {
    inicio = typeof range.offset === 'number' ? range.offset : 0;
    tamanho = typeof range.length === 'number' ? range.length : size - inicio;
  }

  const ehOArquivoInteiro = inicio === 0 && tamanho === size;
  if (ehOArquivoInteiro || tamanho <= 0) return null;
  return { inicio, fim: inicio + tamanho - 1 };
}
