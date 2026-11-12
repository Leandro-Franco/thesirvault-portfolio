/**
 * Registro de downloads (tabela `downloads` no D1). Serve para enxergar
 * abusos; não bloqueia ninguém.
 *
 * @typedef {object} RepositorioDeDownloads
 * @property {(dados: { idDoPedido: string, arquivo: string }) => Promise<void>} registrar
 */

/** @returns {RepositorioDeDownloads} */
export function criarRepositorioDeDownloads(banco, { agora = () => new Date().toISOString(), novoId = () => crypto.randomUUID() } = {}) {
  return {
    async registrar({ idDoPedido, arquivo }) {
      await banco
        .prepare('INSERT INTO downloads (id, pedido_id, arquivo, baixado_em) VALUES (?1, ?2, ?3, ?4)')
        .bind(novoId(), idDoPedido, arquivo, agora())
        .run();
    },
  };
}
