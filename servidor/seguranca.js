import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Funções de criptografia usadas pelo backend, todas da biblioteca padrão do
 * Node (nada de pacote externo para isso).
 */

/**
 * Código do link pessoal do cliente: 32 bytes aleatórios (256 bits) em base64url.
 * Resultado: 43 caracteres, impossível de adivinhar por tentativa e erro.
 */
export function gerarCodigoDeAcesso() {
  return randomBytes(32).toString('base64url');
}

export const FORMATO_DO_CODIGO = /^[A-Za-z0-9_-]{43}$/;

/**
 * Guardamos só o hash do código. Como o código já é aleatório e longo,
 * um SHA-256 simples basta (não precisa de bcrypt, que é para senhas fracas).
 */
export function hashDoCodigo(codigo) {
  return resumoSha256(codigo);
}

/** SHA-256 em hexadecimal. Usado também para não guardar e-mails puros no limitador. */
export function resumoSha256(texto) {
  return createHash('sha256').update(String(texto), 'utf8').digest('hex');
}

/**
 * O servidor tem UM segredo (SEGREDO_DO_SERVIDOR). Para cada finalidade
 * derivamos uma chave diferente, assim uma chave nunca serve para outra coisa.
 */
export function derivarChave(segredoDoServidor, finalidade) {
  return createHmac('sha256', segredoDoServidor).update(`thesirvault:${finalidade}`).digest('hex');
}

/** HMAC-SHA256 em hexadecimal. */
export function assinar(texto, chave) {
  return createHmac('sha256', chave).update(texto).digest('hex');
}

/** IP embaralhado com uma chave, para o limitador sem guardar o IP real (LGPD). */
export function hashDoIp(ip, segredo) {
  return createHmac('sha256', segredo).update(String(ip)).digest('hex').slice(0, 32);
}

/** Compara dois textos sem vazar, pelo tempo de resposta, onde eles diferem. */
export function textosIguais(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Confere a assinatura que o Mercado Pago manda no cabeçalho x-signature.
 *
 * Formato do cabeçalho: "ts=1704908010,v1=<hmac em hex>"
 * O texto assinado é:   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * A chave é a "assinatura secreta" do webhook, no painel do Mercado Pago.
 *
 * Doc: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function assinaturaDoMercadoPagoValida({ cabecalhoAssinatura, idDaRequisicao, idDoRecurso, segredo }) {
  if (!cabecalhoAssinatura || !idDaRequisicao || !idDoRecurso || !segredo) return false;

  const partes = Object.fromEntries(
    cabecalhoAssinatura.split(',').map((parte) => parte.trim().split('=').map((t) => t.trim())),
  );
  const { ts: momento, v1: assinaturaRecebida } = partes;
  if (!momento || !assinaturaRecebida) return false;

  // O Mercado Pago pede o data.id em minúsculas quando ele é alfanumérico.
  const id = String(idDoRecurso).toLowerCase();
  const textoAssinado = `id:${id};request-id:${idDaRequisicao};ts:${momento};`;
  const assinaturaEsperada = createHmac('sha256', segredo).update(textoAssinado).digest('hex');

  return textosIguais(assinaturaEsperada, assinaturaRecebida);
}
