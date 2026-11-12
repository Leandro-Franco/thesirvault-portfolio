import { arquivosParaDownload, VALIDADE_DO_LINK_DE_DOWNLOAD_EM_SEGUNDOS } from '../entregaveis.js';
import { validarArquivo } from '../validacao.js';
import { registrar } from '../registro.js';
import { buscarPedidoPeloCodigo } from './consultar-acesso.js';

/**
 * Caso de uso: o cliente clicou em "Baixar".
 *
 * O cliente escolhe o arquivo pelo id ("presets", "projects", "drums", "videoaulas"), nunca
 * pelo caminho. O caminho real sai da lista do servidor, então não existe como
 * pedir um arquivo fora do pacote (path traversal).
 *
 * Devolve um link assinado, válido por 1 hora, para /api/baixar.
 */
export function criarCasoGerarLinkDeDownload({ pedidos, downloads, links, limitador }) {
  return async function gerarLinkDeDownload({ codigo, arquivo, visitante }) {
    await limitador.exigir(`download:${visitante}`, 30, 10 * 60);
    const pedido = await buscarPedidoPeloCodigo(pedidos, codigo);
    const escolhido = validarArquivo(arquivo, arquivosParaDownload);

    const endereco = links.gerar({
      idDoPedido: pedido.id,
      arquivoId: escolhido.id,
      validadeEmSegundos: VALIDADE_DO_LINK_DE_DOWNLOAD_EM_SEGUNDOS,
    });
    await downloads.registrar({ idDoPedido: pedido.id, arquivo: escolhido.id });

    registrar('info', 'download-liberado', { pedido: pedido.id, arquivo: escolhido.id });
    return { endereco };
  };
}
