import { pacote } from '../../src/conteudo/pacote.js';
import { gerarCodigoDeAcesso, hashDoCodigo } from '../seguranca.js';
import { registrar } from '../registro.js';
import { montarLinkDeAcesso } from './link-de-acesso.js';

/**
 * Caso de uso: o Mercado Pago avisou que um pagamento mudou.
 *
 * Importante: o aviso (webhook) só diz "olhe o pagamento X". Nós NÃO
 * confiamos no conteúdo do aviso: buscamos o pagamento direto na API do
 * Mercado Pago, com o nosso token, e decidimos a partir dessa resposta.
 *
 * - Aprovado: confere valor e moeda, aprova o pedido e envia o link por e-mail.
 * - Reembolsado ou estornado: corta o acesso.
 * - Qualquer outra situação: não faz nada.
 *
 * Pode ser chamado várias vezes para o mesmo pagamento sem efeito duplicado.
 */
export function criarCasoProcessarPagamento({ pedidos, pagamentos, email, urlDoSite }) {
  async function entregarAcesso(pedido, codigo) {
    await email.enviarLinkDeAcesso({
      para: pedido.email,
      nome: pedido.nome,
      link: montarLinkDeAcesso(urlDoSite, codigo),
    });
    await pedidos.marcarEmailEnviado(pedido.id);
  }

  return async function processarPagamento({ idDoPagamento }) {
    const pagamento = await pagamentos.buscarPagamento(idDoPagamento);
    const pedido = pagamento.idDoPedido ? await pedidos.buscarPorId(pagamento.idDoPedido) : null;

    if (!pedido) {
      registrar('alerta', 'pagamento-sem-pedido', { pagamento: pagamento.id });
      return 'ignorado';
    }

    if (pagamento.situacao === 'reembolsado') {
      await pedidos.marcarReembolsado(pedido.id);
      registrar('info', 'acesso-revogado', { pedido: pedido.id, pagamento: pagamento.id });
      return 'revogado';
    }

    if (pagamento.situacao !== 'aprovado') {
      return 'sem-mudanca';
    }

    // Defesa contra manipulação: o valor pago tem que ser o valor do pedido.
    const valorConfere = pagamento.valorEmCentavos === pedido.valorEmCentavos && pagamento.moeda === pacote.moeda;
    if (!valorConfere) {
      registrar('alerta', 'valor-divergente', {
        pedido: pedido.id,
        pagamento: pagamento.id,
        esperado: pedido.valorEmCentavos,
        recebido: pagamento.valorEmCentavos,
        moeda: pagamento.moeda,
      });
      return 'valor-divergente';
    }

    const codigo = gerarCodigoDeAcesso();
    const aprovouAgora = await pedidos.aprovar({
      id: pedido.id,
      idDoPagamento: pagamento.id,
      hashDoCodigo: hashDoCodigo(codigo),
    });

    if (aprovouAgora) {
      await entregarAcesso(pedido, codigo);
      registrar('info', 'pedido-aprovado', { pedido: pedido.id, pagamento: pagamento.id });
      return 'aprovado';
    }

    // Já estava aprovado por OUTRO pagamento: o cliente pagou duas vezes.
    // Não liberamos nada novo; o alerta no log avisa para reembolsar o segundo.
    if (pedido.idDoPagamento && pedido.idDoPagamento !== pagamento.id) {
      registrar('alerta', 'pagamento-duplicado', { pedido: pedido.id, pagamento: pagamento.id });
      return 'pagamento-duplicado';
    }

    // Já estava aprovado. Se o e-mail falhou da outra vez, tentamos de novo
    // com um código novo (o anterior nunca chegou ao cliente).
    if (pedido.status === 'aprovado' && !pedido.emailEnviadoEm) {
      const codigoNovo = gerarCodigoDeAcesso();
      await pedidos.trocarCodigo({ id: pedido.id, hashDoCodigo: hashDoCodigo(codigoNovo) });
      await entregarAcesso(pedido, codigoNovo);
      registrar('info', 'email-reenviado-apos-falha', { pedido: pedido.id });
      return 'email-reenviado';
    }

    return 'ja-processado';
  };
}
