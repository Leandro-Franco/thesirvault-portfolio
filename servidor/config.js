/**
 * Lê e confere a configuração que a Cloudflare entrega ao Worker (`env`).
 *
 * Três tipos de coisa chegam no `env`:
 * - Variáveis públicas, escritas em wrangler.jsonc ("vars"): endereço do site etc.
 * - Segredos, cadastrados com `npx wrangler secret put NOME` (nunca no código).
 * - Ligações (bindings): o banco D1 (BANCO) e o bucket R2 (ARQUIVOS).
 *
 * O que é obrigatório para o site existir fica em OBRIGATORIOS. Se faltar,
 * falha logo na primeira requisição, com mensagem clara no log.
 *
 * Mercado Pago e e-mail (Amazon SES ou Resend) podem ser ligados depois (pré-lançamento):
 * enquanto o segredo de um deles não for cadastrado, aquele serviço fica
 * desligado (null) e a parte da loja que depende dele avisa "em breve".
 * Cadastrar só metade de um serviço é erro, para não abrir vendas pela metade.
 *
 * Para o e-mail há dois provedores com o mesmo papel: Amazon SES ou Resend.
 * Vale o que tiver as chaves cadastradas; os dois ao mesmo tempo é erro.
 *
 * EMAIL_DE_ALERTAS (opcional) é para onde vão os avisos de erro. Vazio: os
 * erros ficam só nos logs.
 */

const OBRIGATORIOS = ['URL_DO_SITE', 'SEGREDO_DO_SERVIDOR', 'BANCO', 'ARQUIVOS'];

/** Cada serviço liga quando TODOS os seus segredos existem; as variáveis vêm junto. */
const SERVICOS_OPCIONAIS = {
  mercadoPago: { segredos: ['MERCADOPAGO_TOKEN_DE_ACESSO', 'MERCADOPAGO_SEGREDO_DO_WEBHOOK'], variaveis: [] },
  emailAmazonSes: {
    segredos: ['AWS_ID_DA_CHAVE_DE_ACESSO', 'AWS_CHAVE_SECRETA'],
    variaveis: ['AWS_REGIAO', 'EMAIL_REMETENTE'],
  },
  emailResend: { segredos: ['RESEND_CHAVE'], variaveis: ['EMAIL_REMETENTE'] },
};

/** Vazio, ou ainda com o texto de exemplo de wrangler.jsonc, conta como não preenchido. */
function preenchido(valor) {
  if (typeof valor === 'string') return valor.trim() !== '' && !valor.startsWith('COLE_AQUI');
  return Boolean(valor);
}

/** @returns {boolean} se o serviço está ligado */
function servicoLigado(env, nome, { segredos, variaveis }) {
  const cadastrados = segredos.filter((segredo) => preenchido(env[segredo]));
  if (cadastrados.length === 0) return false;

  const faltando = [...segredos, ...variaveis].filter((chave) => !preenchido(env[chave]));
  if (faltando.length > 0) {
    throw new Error(`Configuração de ${nome} incompleta no Worker: falta ${faltando.join(', ')}`);
  }
  return true;
}

export function lerConfiguracao(env) {
  const faltando = OBRIGATORIOS.filter((nome) => !preenchido(env[nome]));
  if (faltando.length > 0) {
    throw new Error(`Configuração faltando no Worker: ${faltando.join(', ')}`);
  }

  if (env.SEGREDO_DO_SERVIDOR.length < 32) {
    throw new Error('SEGREDO_DO_SERVIDOR precisa ter pelo menos 32 caracteres aleatórios.');
  }

  const urlDoSite = new URL(env.URL_DO_SITE);
  if (urlDoSite.protocol !== 'https:' && urlDoSite.hostname !== 'localhost') {
    throw new Error('URL_DO_SITE precisa usar https.');
  }

  const ligado = Object.fromEntries(
    Object.entries(SERVICOS_OPCIONAIS).map(([nome, regras]) => [nome, servicoLigado(env, nome, regras)]),
  );

  if (ligado.emailAmazonSes && ligado.emailResend) {
    throw new Error('Dois provedores de e-mail cadastrados (Amazon SES e Resend): apague os segredos de um deles.');
  }

  const mercadoPago = ligado.mercadoPago
    ? { tokenDeAcesso: env.MERCADOPAGO_TOKEN_DE_ACESSO, segredoDoWebhook: env.MERCADOPAGO_SEGREDO_DO_WEBHOOK }
    : null;
  const email = lerEmail(env, ligado);

  const emailDeAlertas = preenchido(env.EMAIL_DE_ALERTAS) ? env.EMAIL_DE_ALERTAS.trim() : null;
  if (emailDeAlertas && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDeAlertas)) {
    throw new Error('EMAIL_DE_ALERTAS não parece um e-mail.');
  }

  return Object.freeze({
    urlDoSite: urlDoSite.origin,
    banco: env.BANCO,
    arquivos: env.ARQUIVOS,
    segredoDoServidor: env.SEGREDO_DO_SERVIDOR,
    mercadoPago,
    email,
    emailDeAlertas,
    /** Nomes dos serviços ainda desligados (vai para o log, nunca para o visitante). */
    servicosDesligados: Object.entries({ mercadoPago, email })
      .filter(([, servico]) => servico === null)
      .map(([nome]) => nome),
  });
}

function lerEmail(env, ligado) {
  if (ligado.emailAmazonSes) {
    return {
      provedor: 'amazon-ses',
      idDaChave: env.AWS_ID_DA_CHAVE_DE_ACESSO,
      chaveSecreta: env.AWS_CHAVE_SECRETA,
      regiao: env.AWS_REGIAO,
      remetente: env.EMAIL_REMETENTE,
    };
  }
  if (ligado.emailResend) {
    return { provedor: 'resend', chave: env.RESEND_CHAVE, remetente: env.EMAIL_REMETENTE };
  }
  return null;
}
