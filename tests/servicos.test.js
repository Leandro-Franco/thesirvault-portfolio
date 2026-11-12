import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { criarServicoDePagamentos } from '../servidor/servicos/mercadopago.js';
import { criarServicoDeEmailResend } from '../servidor/servicos/email-resend.js';
import { criarServicoDeEmailAmazonSes } from '../servidor/servicos/email-amazon-ses.js';
import { assinarRequisicaoAws } from '../servidor/servicos/assinatura-aws.js';
import { montarEmailDeAcesso } from '../servidor/servicos/modelo-de-email.js';
import { arquivosParaDownload } from '../servidor/entregaveis.js';
import { lerConfiguracao } from '../servidor/config.js';
import { ehEnderecoDoMercadoPago } from '../src/comum/api.js';
import { formatarPreco } from '../src/conteudo/pacote.js';

/** fetch falso que guarda as chamadas e responde o JSON pedido. */
function criarBuscarFalso(respostaJson, status = 200) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return new Response(JSON.stringify(respostaJson), { status });
  };
  return { buscar, chamadas };
}

describe('Mercado Pago', () => {
  const pedido = { id: 'pedido-1', nome: 'Ana', email: 'ana@exemplo.com', valorEmCentavos: 4990 };

  it('cria a preferência com valor, referência e chave de idempotência (aviso pelo webhook do painel)', async () => {
    const { buscar, chamadas } = criarBuscarFalso({ init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1' });
    const servico = criarServicoDePagamentos({ tokenDeAcesso: 'TOKEN', buscar });
    const { enderecoDoCheckout } = await servico.criarCheckout({ pedido, titulo: 'Vol. 01', urlDoSite: 'https://seu-dominio.com.br' });

    assert.equal(enderecoDoCheckout, 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1');
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    assert.equal(corpo.items[0].unit_price, 49.9);
    assert.equal(corpo.external_reference, 'pedido-1');
    assert.equal(corpo.notification_url, undefined, 'o aviso vem do webhook do painel, que é assinado');
    assert.equal(chamadas[0].opcoes.headers['X-Idempotency-Key'], 'pedido-1');
    assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer TOKEN');
  });

  it('traduz o pagamento e arredonda o valor para centavos', async () => {
    const { buscar } = criarBuscarFalso({ id: 99, status: 'approved', external_reference: 'pedido-1', transaction_amount: 49.9, currency_id: 'BRL' });
    const pagamento = await criarServicoDePagamentos({ tokenDeAcesso: 'T', buscar }).buscarPagamento('99');
    assert.deepEqual(pagamento, { id: '99', situacao: 'aprovado', idDoPedido: 'pedido-1', valorEmCentavos: 4990, moeda: 'BRL' });
  });

  it('estorno no cartão conta como reembolso', async () => {
    const { buscar } = criarBuscarFalso({ id: 1, status: 'charged_back', external_reference: 'p', transaction_amount: 49.9, currency_id: 'BRL' });
    assert.equal((await criarServicoDePagamentos({ tokenDeAcesso: 'T', buscar }).buscarPagamento('1')).situacao, 'reembolsado');
  });

  it('falha clara quando a API responde erro', async () => {
    const { buscar } = criarBuscarFalso({ message: 'unauthorized' }, 401);
    await assert.rejects(criarServicoDePagamentos({ tokenDeAcesso: 'T', buscar }).buscarPagamento('1'), /401/);
  });
});

describe('e-mail com o link pessoal', () => {
  const link = 'https://seu-dominio.com.br/comprador#codigo=abc';

  it('explica como baixar: os arquivos do pacote, o prazo de 1 hora por download e o acesso vitalício', () => {
    const { texto, html } = montarEmailDeAcesso({ nome: 'Ana', link });
    for (const versao of [texto, html]) {
      for (const { titulo } of arquivosParaDownload) assert.ok(versao.includes(titulo), titulo);
      assert.ok(versao.includes('vale 1 hora'));
      assert.ok(versao.includes('vitalício'));
      assert.ok(versao.includes('https://seu-dominio.com.br/comprador'));
    }
    assert.ok(texto.includes(link));
    assert.ok(html.includes(`href="${link}"`));
  });
});

describe('e-mail pelo Resend', () => {
  it('escapa o nome do cliente no HTML (sem XSS no e-mail)', async () => {
    const { buscar, chamadas } = criarBuscarFalso({ id: 'email-1' });
    await criarServicoDeEmailResend({ chave: 'K', remetente: 'loja@x.com', buscar }).enviarLinkDeAcesso({
      para: 'ana@exemplo.com',
      nome: '<img src=x onerror=alert(1)>',
      link: 'https://seu-dominio.com.br/comprador#codigo=abc',
    });
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    assert.ok(!corpo.html.includes('<img'));
    assert.ok(corpo.html.includes('&lt;img'));
  });
});

describe('assinatura da AWS (Signature Version 4)', () => {
  // Exemplo "get-vanilla" da suíte de testes oficial da AWS: credenciais,
  // data e assinatura esperada são as publicadas pela própria AWS.
  it('bate com a suíte oficial da AWS', () => {
    const cabecalhos = assinarRequisicaoAws({
      metodo: 'GET',
      url: 'https://example.amazonaws.com/',
      regiao: 'us-east-1',
      servico: 'service',
      idDaChave: 'AKIDEXAMPLE',
      chaveSecreta: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      agora: new Date('2015-08-30T12:36:00Z'),
    });
    assert.equal(cabecalhos['x-amz-date'], '20150830T123600Z');
    assert.equal(
      cabecalhos.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    assert.equal(cabecalhos.host, undefined, 'o Host fica por conta do fetch');
  });

  it('mudar o corpo muda a assinatura (ninguém altera a requisição no caminho)', () => {
    const base = { metodo: 'POST', url: 'https://email.sa-east-1.amazonaws.com/v2/email/outbound-emails', regiao: 'sa-east-1', servico: 'ses', idDaChave: 'A', chaveSecreta: 'S', agora: new Date('2026-11-12T00:00:00Z') };
    const um = assinarRequisicaoAws({ ...base, corpo: '{"a":1}' }).authorization;
    const outro = assinarRequisicaoAws({ ...base, corpo: '{"a":2}' }).authorization;
    assert.notEqual(um, outro);
  });
});

describe('e-mail pelo Amazon SES', () => {
  const configuracao = { idDaChave: 'AKIDEXAMPLE', chaveSecreta: 'segredo', regiao: 'sa-east-1', remetente: 'The Sir Vault <acesso@seu-dominio.com.br>' };
  const dados = { para: 'ana@exemplo.com', nome: '<b>Ana</b>', link: 'https://seu-dominio.com.br/comprador#codigo=abc' };

  it('chama a API v2 da região certa, assinada, com o e-mail montado e o nome escapado', async () => {
    const { buscar, chamadas } = criarBuscarFalso({ MessageId: 'm-1' });
    await criarServicoDeEmailAmazonSes({ ...configuracao, buscar, agora: () => new Date('2026-11-12T18:00:00Z') }).enviarLinkDeAcesso(dados);

    const { url, opcoes } = chamadas[0];
    assert.equal(url, 'https://email.sa-east-1.amazonaws.com/v2/email/outbound-emails');
    assert.equal(opcoes.method, 'POST');
    assert.match(opcoes.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261112\/sa-east-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);

    const corpo = JSON.parse(opcoes.body);
    assert.equal(corpo.FromEmailAddress, 'The Sir Vault <acesso@seu-dominio.com.br>');
    assert.deepEqual(corpo.Destination.ToAddresses, ['ana@exemplo.com']);
    assert.equal(corpo.Content.Simple.Subject.Data, 'Seu acesso ao The Sir Vault');
    assert.ok(corpo.Content.Simple.Body.Html.Data.includes('&lt;b&gt;Ana&lt;/b&gt;'));
    assert.ok(corpo.Content.Simple.Body.Text.Data.includes(dados.link));
  });

  it('mensagem livre (alerta) vai só em texto, sem parte HTML', async () => {
    const { buscar, chamadas } = criarBuscarFalso({ MessageId: 'm-2' });
    await criarServicoDeEmailAmazonSes({ ...configuracao, buscar }).enviarMensagem({ para: 'dono@exemplo.com', assunto: 'Alerta', texto: 'Algo falhou' });
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    assert.deepEqual(corpo.Content.Simple.Body, { Text: { Data: 'Algo falhou', Charset: 'UTF-8' } });
    assert.equal(corpo.Content.Simple.Subject.Data, 'Alerta');
  });

  it('erro da AWS (ex.: sandbox recusando o destinatário) vira falha, para o Mercado Pago tentar de novo', async () => {
    const mensagem = `Email address is not verified. The following identities failed the check in region SA-EAST-1: ${dados.para}`;
    const buscar = async () =>
      new Response(JSON.stringify({ message: mensagem }), {
        status: 400,
        headers: { 'x-amzn-ErrorType': 'MessageRejected:http://internal.amazon.com/coral/com.amazonaws.sesv2/' },
      });
    const erro = await criarServicoDeEmailAmazonSes({ ...configuracao, buscar })
      .enviarLinkDeAcesso(dados)
      .then(() => null, (falha) => falha);

    assert.match(erro.message, /^Amazon SES respondeu 400 \(MessageRejected\): .*not verified/);
    assert.ok(!erro.message.includes(dados.para), 'o e-mail do comprador não vai para o log');
    assert.ok(erro.message.includes('[e-mail]'));
  });
});

describe('configuração', () => {
  const completo = {
    URL_DO_SITE: 'https://seu-dominio.com.br',
    EMAIL_REMETENTE: 'loja@seu-dominio.com.br',
    MERCADOPAGO_TOKEN_DE_ACESSO: 'x',
    MERCADOPAGO_SEGREDO_DO_WEBHOOK: 'x',
    AWS_ID_DA_CHAVE_DE_ACESSO: 'AKIA',
    AWS_CHAVE_SECRETA: 'x',
    AWS_REGIAO: 'sa-east-1',
    SEGREDO_DO_SERVIDOR: 'a'.repeat(64),
    BANCO: {},
    ARQUIVOS: {},
  };

  it('falha listando o que falta do obrigatório, sem mostrar valores', () => {
    const { BANCO, SEGREDO_DO_SERVIDOR, ...semDois } = completo;
    assert.throws(() => lerConfiguracao(semDois), /SEGREDO_DO_SERVIDOR, BANCO/);
  });

  it('com tudo cadastrado, todos os serviços ficam ligados', () => {
    const config = lerConfiguracao(completo);
    assert.ok(config.mercadoPago && config.email);
    assert.deepEqual(config.servicosDesligados, []);
  });

  it('pré-lançamento: serviço sem segredo fica desligado (null), e texto de exemplo conta como vazio', () => {
    const { MERCADOPAGO_TOKEN_DE_ACESSO, MERCADOPAGO_SEGREDO_DO_WEBHOOK, AWS_ID_DA_CHAVE_DE_ACESSO, AWS_CHAVE_SECRETA, ...minimo } = completo;
    const config = lerConfiguracao({ ...minimo, MERCADOPAGO_TOKEN_DE_ACESSO: 'COLE_AQUI_O_TOKEN' });
    assert.equal(config.mercadoPago, null);
    assert.equal(config.email, null);
    assert.deepEqual(config.servicosDesligados, ['mercadoPago', 'email']);
  });

  it('e-mail: usa o Amazon SES ou o Resend, conforme as chaves cadastradas', () => {
    assert.equal(lerConfiguracao(completo).email.provedor, 'amazon-ses');
    assert.equal(lerConfiguracao(completo).email.regiao, 'sa-east-1');

    const { AWS_ID_DA_CHAVE_DE_ACESSO, AWS_CHAVE_SECRETA, ...semAws } = completo;
    const comResend = lerConfiguracao({ ...semAws, RESEND_CHAVE: 're_x' });
    assert.deepEqual(comResend.email, { provedor: 'resend', chave: 're_x', remetente: 'loja@x.com'.replace('x.com', 'seu-dominio.com.br') });
  });

  it('e-mail de alertas: opcional, mas se vier precisa parecer um e-mail', () => {
    assert.equal(lerConfiguracao(completo).emailDeAlertas, null);
    assert.equal(lerConfiguracao({ ...completo, EMAIL_DE_ALERTAS: ' dono@exemplo.com ' }).emailDeAlertas, 'dono@exemplo.com');
    assert.throws(() => lerConfiguracao({ ...completo, EMAIL_DE_ALERTAS: 'dono' }), /EMAIL_DE_ALERTAS/);
  });

  it('e-mail: os dois provedores ao mesmo tempo é erro', () => {
    assert.throws(() => lerConfiguracao({ ...completo, RESEND_CHAVE: 're_x' }), /Dois provedores de e-mail/);
  });

  it('serviço cadastrado pela metade é erro (não abre vendas pela metade)', () => {
    const { MERCADOPAGO_SEGREDO_DO_WEBHOOK, ...semSegredoDoWebhook } = completo;
    assert.throws(() => lerConfiguracao(semSegredoDoWebhook), /mercadoPago incompleta.*MERCADOPAGO_SEGREDO_DO_WEBHOOK/);
    const { AWS_CHAVE_SECRETA, ...semChaveSecreta } = completo;
    assert.throws(() => lerConfiguracao(semChaveSecreta), /emailAmazonSes incompleta.*AWS_CHAVE_SECRETA/);
    const { AWS_REGIAO, ...semRegiao } = completo;
    assert.throws(() => lerConfiguracao(semRegiao), /emailAmazonSes incompleta.*AWS_REGIAO/);
  });

  it('exige https fora do localhost e segredo do servidor longo', () => {
    assert.throws(() => lerConfiguracao({ ...completo, URL_DO_SITE: 'http://seu-dominio.com.br' }), /https/);
    assert.throws(() => lerConfiguracao({ ...completo, SEGREDO_DO_SERVIDOR: 'curto' }), /32 caracteres/);
    assert.equal(lerConfiguracao({ ...completo, URL_DO_SITE: 'https://seu-dominio.com.br/' }).urlDoSite, 'https://seu-dominio.com.br');
  });
});

describe('navegador', () => {
  it('só redireciona para o checkout do Mercado Pago (sem redirecionamento aberto)', () => {
    assert.equal(ehEnderecoDoMercadoPago('https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1'), true);
    assert.equal(ehEnderecoDoMercadoPago('https://sandbox.mercadopago.com.br/checkout/v1/redirect'), true);
    for (const endereco of [
      'https://mercadopago.com.br.golpe.com/checkout',
      'https://golpe-mercadopago.com.br/x',
      'http://www.mercadopago.com.br/checkout',
      'javascript:alert(1)',
      '//www.mercadopago.com.br',
      '',
    ]) {
      assert.equal(ehEnderecoDoMercadoPago(endereco), false, endereco);
    }
  });

  it('formata o preço em reais', () => {
    assert.equal(formatarPreco(4990), 'R$ 49,90');
  });
});
