import { montarEmailDeAcesso } from './modelo-de-email.js';
import { assinarRequisicaoAws } from './assinatura-aws.js';

/**
 * Envio de e-mail pelo Amazon SES (API v2, sem SDK).
 *
 * A chave usada aqui deve ser de um usuário da AWS que só pode enviar e-mail
 * (permissão ses:SendEmail), nada mais. 
 * Doc da API: https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
 *
 * @typedef {import('./modelo-de-email.js').ServicoDeEmail} ServicoDeEmail
 */

const TEMPO_LIMITE_EM_MS = 10_000;
const PARECE_EMAIL = /[^\s"'<>(),;:]+@[^\s"'<>(),;:]+/g;

/** @returns {ServicoDeEmail} */
export function criarServicoDeEmailAmazonSes({
  idDaChave,
  chaveSecreta,
  regiao,
  remetente,
  buscar = globalThis.fetch,
  agora = () => new Date(),
}) {
  const url = `https://email.${regiao}.amazonaws.com/v2/email/outbound-emails`;

  async function enviar({ para, assunto, texto, html }) {
    const corpo = JSON.stringify({
      FromEmailAddress: remetente,
      Destination: { ToAddresses: [para] },
      Content: {
        Simple: {
          Subject: { Data: assunto, Charset: 'UTF-8' },
          Body: {
            ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
            Text: { Data: texto, Charset: 'UTF-8' },
          },
        },
      },
    });

    const cabecalhos = assinarRequisicaoAws({
      metodo: 'POST',
      url,
      corpo,
      cabecalhos: { 'content-type': 'application/json' },
      regiao,
      servico: 'ses',
      idDaChave,
      chaveSecreta,
      agora: agora(),
    });

    const resposta = await buscar(url, {
      method: 'POST',
      headers: cabecalhos,
      body: corpo,
      signal: AbortSignal.timeout(TEMPO_LIMITE_EM_MS),
    });
    if (!resposta.ok) {
      // O motivo vai para o log (ex.: "MessageRejected" no sandbox); nunca para o visitante.
      // A AWS às vezes repete o endereço do comprador na mensagem: ele é tirado antes.
      const tipo = (resposta.headers.get('x-amzn-errortype') || '').split(':')[0];
      const motivo = (await resposta.text().catch(() => '')).replace(PARECE_EMAIL, '[e-mail]');
      throw new Error(`Amazon SES respondeu ${resposta.status}${tipo ? ` (${tipo})` : ''}: ${motivo.slice(0, 200)}`);
    }
  }

  return {
    enviarLinkDeAcesso: ({ para, nome, link }) => enviar({ para, ...montarEmailDeAcesso({ nome, link }) }),
    enviarMensagem: enviar,
  };
}
