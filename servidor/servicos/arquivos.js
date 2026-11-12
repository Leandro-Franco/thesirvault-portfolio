/**
 * Leitura dos arquivos do pacote no Cloudflare R2 (ligação ARQUIVOS).
 *
 * O bucket não é público: o único caminho até os arquivos é o nosso Worker,
 * depois de conferir o link assinado e o pedido.
 *
 * @typedef {object} ServicoDeArquivos
 * @property {(caminho: string, cabecalhos: Headers) => Promise<object | null>} abrir
 *   devolve o objeto do R2 (com .body para enviar) ou null se não existir.
 *   Os cabeçalhos da requisição permitem continuar downloads interrompidos (Range).
 */

/** @returns {ServicoDeArquivos} */
export function criarServicoDeArquivos(bucket) {
  return {
    async abrir(caminho, cabecalhos) {
      return bucket.get(caminho, { range: cabecalhos });
    },
  };
}
