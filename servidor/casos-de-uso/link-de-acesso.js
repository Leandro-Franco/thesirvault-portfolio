/**
 * Monta o link pessoal do cliente.
 * O código vai depois do "#": essa parte não é enviada a servidores nem
 * aparece em logs ou no cabeçalho Referer.
 */
export function montarLinkDeAcesso(urlDoSite, codigo) {
  return `${urlDoSite}/comprador#codigo=${codigo}`;
}
