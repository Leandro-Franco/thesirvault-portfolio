import { arquivosParaDownload, VALIDADE_DO_LINK_DE_DOWNLOAD_EM_SEGUNDOS } from '../entregaveis.js';

/**
 * O e-mail com o link pessoal, igual para qualquer provedor de envio
 * (Amazon SES ou Resend). Vai na compra aprovada e no "não recebi meu e-mail",
 * então o texto serve para os dois casos.
 *
 * @typedef {object} ServicoDeEmail
 * @property {(dados: { para: string, nome: string, link: string }) => Promise<void>} enviarLinkDeAcesso
 * @property {(dados: { para: string, assunto: string, texto: string, html?: string }) => Promise<void>} enviarMensagem
 *   e-mail livre, usado para os alertas que vão para o dono da loja
 */

const ENDERECO_PARA_PEDIR_NOVO_LINK = 'https://seu-dominio.com.br/comprador';

/** A lista e o prazo vêm da mesma fonte que o servidor usa, para o e-mail nunca prometer outra coisa. */
const nomesDosArquivos = arquivosParaDownload.map((arquivo) => arquivo.titulo);
const validadeDoDownload = descreverDuracao(VALIDADE_DO_LINK_DE_DOWNLOAD_EM_SEGUNDOS);

/** O passo a passo, em frases simples, usado nas versões texto e HTML. */
const comoBaixar = [
  `Abra o seu link pessoal, logo acima. Lá estão os ${nomesDosArquivos.length} arquivos do pacote: ${juntarEmLista(nomesDosArquivos)}.`,
  'Clique em "Baixar" em cada arquivo. São arquivos grandes, então prefira o computador e uma conexão estável.',
  `Cada clique em "Baixar" gera um endereço que vale ${validadeDoDownload}. Um download que começou nesse prazo vai até o fim. Se o endereço vencer, volte ao seu link pessoal e clique de novo.`,
  'Os arquivos vêm em .zip. Depois de baixar, extraia: no Windows, botão direito e "Extrair tudo"; no Mac, dois cliques no arquivo.',
];

const ACESSO_VITALICIO = 'Seu acesso é vitalício: este link não expira e você pode baixar de novo quando quiser.';

const avisosFinais = [
  'Guarde este e-mail. O link é só seu: não compartilhe.',
  `Perdeu o link? Peça um novo em ${ENDERECO_PARA_PEDIR_NOVO_LINK}. O link novo substitui o antigo.`,
];

/** @returns {{ assunto: string, html: string, texto: string }} */
export function montarEmailDeAcesso({ nome, link }) {
  return {
    assunto: 'Seu acesso ao The Sir Vault',
    html: montarHtml(nome, link),
    texto: montarTexto(nome, link),
  };
}

function montarTexto(nome, link) {
  return [
    `Olá, ${nome}!`,
    '',
    'Sua compra está confirmada. Este é o seu link pessoal do The Sir Vault:',
    link,
    '',
    ACESSO_VITALICIO,
    '',
    'Como baixar:',
    ...comoBaixar.map((passo, indice) => `${indice + 1}. ${passo}`),
    '',
    ...avisosFinais,
    '',
    'Franco The Sir',
  ].join('\n');
}

/** O nome vem do cliente: sempre escapado antes de entrar no HTML do e-mail. */
function montarHtml(nome, link) {
  const nomeSeguro = escaparHtml(nome);
  const linkSeguro = escaparHtml(link);
  const passos = comoBaixar.map((passo) => `<li style="margin-bottom:8px">${escaparHtml(passo)}</li>`).join('');
  const avisos = avisosFinais.map(escaparHtml).join('<br>');
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#100d09;color:#f6e8c9;font-family:Arial,Helvetica,sans-serif;line-height:1.5">
    <p style="color:#e8b65b;font-weight:bold;letter-spacing:.2em">◈ THE SIR VAULT</p>
    <h1 style="font-size:22px">Olá, ${nomeSeguro}!</h1>
    <p>Sua compra está confirmada. Este é o seu link pessoal:</p>
    <p><a href="${linkSeguro}" style="display:inline-block;padding:14px 18px;background:#e2ad48;color:#1a1207;border-radius:9px;font-weight:bold;text-decoration:none">Acessar meus arquivos</a></p>
    <p>${escaparHtml(ACESSO_VITALICIO)}</p>
    <h2 style="font-size:17px;color:#e8b65b">Como baixar</h2>
    <ol style="padding-left:20px">${passos}</ol>
    <p style="color:#c9bca4;font-size:13px">${avisos}</p>
    <p>Franco The Sir</p>
  </body>
</html>`;
}

/** 3600 → "1 hora"; 7200 → "2 horas"; 1800 → "30 minutos". */
function descreverDuracao(segundos) {
  const horas = segundos / 3600;
  if (Number.isInteger(horas)) return horas === 1 ? '1 hora' : `${horas} horas`;
  return `${Math.round(segundos / 60)} minutos`;
}

/** ["A", "B", "C"] → "A, B e C". */
function juntarEmLista(itens) {
  return itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

function escaparHtml(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
