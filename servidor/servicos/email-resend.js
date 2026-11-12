import { montarEmailDeAcesso } from './modelo-de-email.js';

/**
 * Envio de e-mail pelo Resend (API REST, sem SDK).
 * Alternativa ao Amazon SES: o Worker usa o que estiver cadastrado (servidor/config.js).
 *
 * @typedef {import('./modelo-de-email.js').ServicoDeEmail} ServicoDeEmail
 */

const API = 'https://api.resend.com/emails';
const TEMPO_LIMITE_EM_MS = 10_000;

/** @returns {ServicoDeEmail} */
export function criarServicoDeEmailResend({ chave, remetente, buscar = globalThis.fetch }) {
  async function enviar({ para, assunto, texto, html }) {
    const resposta = await buscar(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [para],
        subject: assunto,
        ...(html ? { html } : {}),
        text: texto,
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_EM_MS),
    });
    if (!resposta.ok) {
      throw new Error(`Resend respondeu ${resposta.status}`);
    }
  }

  return {
    enviarLinkDeAcesso: ({ para, nome, link }) => enviar({ para, ...montarEmailDeAcesso({ nome, link }) }),
    enviarMensagem: enviar,
  };
}
