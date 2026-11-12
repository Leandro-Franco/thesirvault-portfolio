import { createHash, createHmac } from 'node:crypto';

/**
 * Assinatura de requisições para a AWS ("Signature Version 4").
 *
 * A AWS não usa uma chave simples no cabeçalho: cada requisição é assinada com
 * HMAC-SHA256 sobre o método, o caminho, os cabeçalhos, o corpo e a data. Assim
 * a chave secreta nunca viaja pela rede, e uma requisição capturada não pode
 * ser alterada nem reaproveitada depois de alguns minutos.
 *
 * Passo a passo oficial:
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 *
 * Feito para as chamadas simples que usamos (API do SES): caminho sem
 * caracteres especiais e sem parâmetros na URL.
 */

const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');
const hmac = (chave, texto) => createHmac('sha256', chave).update(texto, 'utf8').digest();

/** 2026-11-12T18:52:43.123Z → 20261112T185243Z */
function dataHoraDaAws(momento) {
  return momento.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * @returns {Record<string, string>} cabeçalhos para enviar junto (com Authorization)
 */
export function assinarRequisicaoAws({
  metodo,
  url,
  corpo = '',
  cabecalhos = {},
  regiao,
  servico,
  idDaChave,
  chaveSecreta,
  agora = new Date(),
}) {
  const endereco = new URL(url);
  if (endereco.search) throw new Error('assinarRequisicaoAws não trata parâmetros na URL.');

  const dataHora = dataHoraDaAws(agora);
  const data = dataHora.slice(0, 8);

  // 1. Requisição canônica: tudo o que vai ser assinado, num formato fixo.
  const assinados = { host: endereco.host, 'x-amz-date': dataHora };
  for (const [nome, valor] of Object.entries(cabecalhos)) assinados[nome.toLowerCase()] = String(valor).trim();
  const nomes = Object.keys(assinados).sort();
  const listaDeCabecalhos = nomes.join(';');
  const requisicaoCanonica = [
    metodo.toUpperCase(),
    endereco.pathname,
    '', // sem parâmetros na URL
    nomes.map((nome) => `${nome}:${assinados[nome]}\n`).join(''),
    listaDeCabecalhos,
    sha256(corpo),
  ].join('\n');

  // 2. Texto a assinar: data, "escopo" (dia/região/serviço) e o resumo da requisição.
  const escopo = `${data}/${regiao}/${servico}/aws4_request`;
  const textoParaAssinar = ['AWS4-HMAC-SHA256', dataHora, escopo, sha256(requisicaoCanonica)].join('\n');

  // 3. Chave do dia, derivada da chave secreta, e a assinatura.
  const chaveDoDia = hmac(hmac(hmac(hmac(`AWS4${chaveSecreta}`, data), regiao), servico), 'aws4_request');
  const assinatura = createHmac('sha256', chaveDoDia).update(textoParaAssinar, 'utf8').digest('hex');

  const { host, ...semHost } = assinados; // o fetch preenche o Host sozinho
  return {
    ...semHost,
    authorization: `AWS4-HMAC-SHA256 Credential=${idDaChave}/${escopo}, SignedHeaders=${listaDeCabecalhos}, Signature=${assinatura}`,
  };
}
