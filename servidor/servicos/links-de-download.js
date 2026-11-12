import { assinar, textosIguais } from '../seguranca.js';

/**
 * Links de download temporários, assinados pelo nosso servidor.
 *
 * Formato:  /api/baixar?pedido=<id>&arquivo=drums&expira=<segundos>&assinatura=<hmac>
 *
 * A assinatura é um HMAC de "pedido:arquivo:expira" com uma chave que só o
 * servidor conhece. Mudar qualquer parte do link (outro arquivo, outro pedido,
 * prazo maior) invalida a assinatura.
 *
 * @typedef {object} ServicoDeLinksDeDownload
 * @property {(dados: { idDoPedido: string, arquivoId: string, validadeEmSegundos: number }) => string} gerar
 * @property {(parametros: URLSearchParams) => { idDoPedido: string, arquivoId: string } | null} conferir
 */

/** @returns {ServicoDeLinksDeDownload} */
export function criarServicoDeLinksDeDownload({ urlDoSite, chave, agoraEmSegundos = () => Math.floor(Date.now() / 1000) }) {
  const textoAssinado = (idDoPedido, arquivoId, expira) => `${idDoPedido}:${arquivoId}:${expira}`;

  return {
    gerar({ idDoPedido, arquivoId, validadeEmSegundos }) {
      const expira = agoraEmSegundos() + validadeEmSegundos;
      const endereco = new URL('/api/baixar', urlDoSite);
      endereco.searchParams.set('pedido', idDoPedido);
      endereco.searchParams.set('arquivo', arquivoId);
      endereco.searchParams.set('expira', String(expira));
      endereco.searchParams.set('assinatura', assinar(textoAssinado(idDoPedido, arquivoId, expira), chave));
      return endereco.toString();
    },

    /** Devolve o pedido e o arquivo se o link for autêntico e estiver no prazo; senão, null. */
    conferir(parametros) {
      const idDoPedido = parametros.get('pedido') || '';
      const arquivoId = parametros.get('arquivo') || '';
      const expira = parametros.get('expira') || '';
      const assinatura = parametros.get('assinatura') || '';

      if (!/^\d{1,12}$/.test(expira) || Number(expira) < agoraEmSegundos()) return null;
      const esperada = assinar(textoAssinado(idDoPedido, arquivoId, expira), chave);
      if (!textosIguais(esperada, assinatura)) return null;
      return { idDoPedido, arquivoId };
    },
  };
}
