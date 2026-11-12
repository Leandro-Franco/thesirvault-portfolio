import { arquivosParaDownload } from '../entregaveis.js';
import { ErroDeLinkDeDownload } from '../erros.js';
import { registrar } from '../registro.js';

/**
 * Caso de uso: o navegador abriu o link assinado de download.
 *
 * 1. Confere a assinatura e o prazo do link.
 * 2. Confere de novo se o pedido continua aprovado (um reembolso feito
 *    depois de gerar o link já corta o download).
 * 3. Abre o arquivo no R2 e devolve para a rota enviar ao navegador.
 */
export function criarCasoBaixarArquivo({ pedidos, links, arquivos, limitador }) {
  return async function baixarArquivo({ parametros, cabecalhos, visitante }) {
    await limitador.exigir(`baixar:${visitante}`, 60, 10 * 60);

    const link = links.conferir(parametros);
    if (!link) throw new ErroDeLinkDeDownload();

    const pedido = await pedidos.buscarPorId(link.idDoPedido);
    if (!pedido || pedido.status !== 'aprovado') throw new ErroDeLinkDeDownload();

    const arquivo = arquivosParaDownload.find((a) => a.id === link.arquivoId);
    if (!arquivo) throw new ErroDeLinkDeDownload();

    const conteudo = await arquivos.abrir(arquivo.caminhoNoArmazenamento, cabecalhos);
    if (!conteudo) {
      // O link é válido, mas o arquivo não está no R2: erro nosso, não do cliente.
      registrar('erro', 'arquivo-ausente-no-r2', { arquivo: arquivo.id });
      throw new Error(`Arquivo ausente no R2: ${arquivo.id}`);
    }

    return { conteudo, nomeDoArquivo: `the-sir-vault-${arquivo.id}.zip` };
  };
}
