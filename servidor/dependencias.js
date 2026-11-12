import { lerConfiguracao } from './config.js';
import { derivarChave, hashDoIp } from './seguranca.js';
import { criarRepositorioDePedidos } from './repositorios/pedidos.js';
import { criarRepositorioDeDownloads } from './repositorios/downloads.js';
import { criarServicoDePagamentos } from './servicos/mercadopago.js';
import { criarServicoDeEmailAmazonSes } from './servicos/email-amazon-ses.js';
import { criarServicoDeEmailResend } from './servicos/email-resend.js';
import { criarServicoDeArquivos } from './servicos/arquivos.js';
import { criarServicoDeLinksDeDownload } from './servicos/links-de-download.js';
import { criarLimitador } from './servicos/limitador.js';
import { criarServicoDeAlertas } from './servicos/alertas.js';
import { criarCasoCriarPedido } from './casos-de-uso/criar-pedido.js';
import { criarCasoProcessarPagamento } from './casos-de-uso/processar-pagamento.js';
import { criarCasoConsultarAcesso } from './casos-de-uso/consultar-acesso.js';
import { criarCasoGerarLinkDeDownload } from './casos-de-uso/gerar-link-de-download.js';
import { criarCasoBaixarArquivo } from './casos-de-uso/baixar-arquivo.js';
import { criarCasoReenviarAcesso } from './casos-de-uso/reenviar-acesso.js';
import { criarCasoLimparDadosTemporarios } from './casos-de-uso/limpar-dados-temporarios.js';
import {
  casoAindaIndisponivel,
  MENSAGEM_VENDAS_EM_BREVE,
  MENSAGEM_REENVIO_EM_BREVE,
} from './servicos/pre-lancamento.js';
import { registrar, retirarAlertas } from './registro.js';

/**
 * "Raiz de composição": o único lugar que liga as peças reais entre si.
 * Os casos de uso não sabem que existe D1, R2, Mercado Pago, Amazon SES ou Resend;
 * eles só recebem objetos com as funções de que precisam.
 *
 * Montamos tudo uma vez por `env` e reaproveitamos entre requisições.
 *
 * Pré-lançamento: serviços ainda não cadastrados (config.mercadoPago,
 * ou config.email iguais a null) são trocados por peças que
 * avisam "em breve". As vendas só abrem com Mercado Pago E e-mail ligados,
 * para ninguém pagar sem receber o link.
 */
const montadas = new WeakMap();

/** Provedores de e-mail com o mesmo contrato (enviarLinkDeAcesso). */
const PROVEDORES_DE_EMAIL = {
  'amazon-ses': criarServicoDeEmailAmazonSes,
  resend: criarServicoDeEmailResend,
};

export function obterDependencias(env) {
  if (!montadas.has(env)) montadas.set(env, montar(env));
  return montadas.get(env);
}

function montar(env) {
  const config = lerConfiguracao(env);
  const { urlDoSite } = config;
  if (config.servicosDesligados.length > 0) {
    registrar('alerta', 'servicos-desligados', { servicos: config.servicosDesligados });
  }

  const pedidos = criarRepositorioDePedidos(config.banco);
  const downloads = criarRepositorioDeDownloads(config.banco);
  const limitador = criarLimitador(config.banco);
  const arquivos = criarServicoDeArquivos(config.arquivos);
  const links = criarServicoDeLinksDeDownload({
    urlDoSite,
    chave: derivarChave(config.segredoDoServidor, 'links-de-download'),
  });

  const pagamentos = config.mercadoPago
    ? criarServicoDePagamentos({ tokenDeAcesso: config.mercadoPago.tokenDeAcesso })
    : null;
  const email = config.email ? PROVEDORES_DE_EMAIL[config.email.provedor](config.email) : null;
  const vendasAbertas = Boolean(pagamentos && email);
  const alertas =
    email && config.emailDeAlertas ? criarServicoDeAlertas({ email, limitador, para: config.emailDeAlertas }) : null;

  const chaveDeVisitante = derivarChave(config.segredoDoServidor, 'visitante');

  return {
    config,
    /** Identifica o visitante pelo IP embaralhado (nunca o IP puro). */
    identificarVisitante: (ip) => hashDoIp(ip, chaveDeVisitante),
    criarPedido: vendasAbertas
      ? criarCasoCriarPedido({ pedidos, pagamentos, limitador, urlDoSite })
      : casoAindaIndisponivel(MENSAGEM_VENDAS_EM_BREVE),
    processarPagamento: vendasAbertas
      ? criarCasoProcessarPagamento({ pedidos, pagamentos, email, urlDoSite })
      : casoAindaIndisponivel(MENSAGEM_VENDAS_EM_BREVE),
    consultarAcesso: criarCasoConsultarAcesso({ pedidos, limitador }),
    gerarLinkDeDownload: criarCasoGerarLinkDeDownload({ pedidos, downloads, links, limitador }),
    baixarArquivo: criarCasoBaixarArquivo({ pedidos, links, arquivos, limitador }),
    reenviarAcesso: email
      ? criarCasoReenviarAcesso({ pedidos, email, limitador, urlDoSite })
      : casoAindaIndisponivel(MENSAGEM_REENVIO_EM_BREVE),
    limparDadosTemporarios: criarCasoLimparDadosTemporarios({ pedidos, limitador }),

    /** Para o monitor externo: o banco responde e as vendas estão abertas? */
    async lojaFuncionando() {
      const resposta = await config.banco.prepare('SELECT 1 AS ok').first();
      return vendasAbertas && resposta?.ok === 1;
    },

    /** Manda por e-mail os alertas guardados no log. Sem EMAIL_DE_ALERTAS, só esvazia a fila. */
    async enviarAlertas() {
      const registros = retirarAlertas();
      if (alertas && registros.length > 0) await alertas.enviar(registros);
    },
  };
}
