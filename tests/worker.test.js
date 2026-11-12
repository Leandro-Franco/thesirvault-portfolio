import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../servidor/index.js';
import baixar, { trechoPedido } from '../servidor/rotas/baixar.js';
import { criarD1Local } from './d1-local.js';
import { criarRepositorioDePedidos } from '../servidor/repositorios/pedidos.js';
import { gerarCodigoDeAcesso, hashDoCodigo } from '../servidor/seguranca.js';
import { retirarAlertas } from '../servidor/registro.js';

/**
 * Bucket falso que imita o R2 de verdade (conferido com o wrangler dev):
 * - `range` sempre vem preenchido, com suffix: undefined;
 * - Range inválido ou fora do arquivo é ignorado e o arquivo vem inteiro.
 */
function criarBucketComoR2(arquivos) {
  return {
    async get(caminho, { range: cabecalhos } = {}) {
      if (!(caminho in arquivos)) return null;
      const bytes = new TextEncoder().encode(arquivos[caminho]);
      const pedido = /^bytes=(\d*)-(\d*)$/.exec(cabecalhos?.get('range') ?? '');
      let offset = 0;
      let length = bytes.length;
      if (pedido && (pedido[1] || pedido[2])) {
        const inicio = pedido[1] === '' ? bytes.length - Number(pedido[2]) : Number(pedido[1]);
        const fim = pedido[1] === '' || pedido[2] === '' ? bytes.length - 1 : Math.min(Number(pedido[2]), bytes.length - 1);
        if (inicio >= 0 && inicio <= fim) [offset, length] = [inicio, fim - inicio + 1];
      }
      return {
        body: new Blob([bytes.slice(offset, offset + length)]).stream(),
        size: bytes.length,
        httpEtag: '"e"',
        range: { offset, length, suffix: undefined },
      };
    },
  };
}

/** env parecido com o da Cloudflare, com D1 local e R2 falso. */
function criarEnv({ arquivos = {} } = {}) {
  return {
    URL_DO_SITE: 'https://seu-dominio.com.br',
    EMAIL_REMETENTE: 'loja@seu-dominio.com.br',
    MERCADOPAGO_TOKEN_DE_ACESSO: 'x',
    MERCADOPAGO_SEGREDO_DO_WEBHOOK: 'segredo-webhook',
    AWS_ID_DA_CHAVE_DE_ACESSO: 'AKIA',
    AWS_CHAVE_SECRETA: 'x',
    AWS_REGIAO: 'sa-east-1',
    SEGREDO_DO_SERVIDOR: 'a'.repeat(64),
    BANCO: criarD1Local(),
    ARQUIVOS: criarBucketComoR2(arquivos),
    ASSETS: { fetch: async () => new Response('<html>página estática</html>') },
  };
}

const pedir = (caminho, opcoes = {}, env = criarEnv()) =>
  worker.fetch(new Request(`https://seu-dominio.com.br${caminho}`, opcoes), env);

describe('roteador do Worker', () => {
  it('páginas vão para os arquivos estáticos', async () => {
    const resposta = await pedir('/comprador');
    assert.equal(await resposta.text(), '<html>página estática</html>');
  });

  it('rota desconhecida em /api responde 404 em JSON', async () => {
    const resposta = await pedir('/api/nao-existe');
    assert.equal(resposta.status, 404);
    assert.deepEqual(await resposta.json(), { erro: 'Endereço não encontrado.' });
  });

  it('"../" no endereço é resolvido antes do roteamento (não escapa de /api)', async () => {
    // new URL() já normaliza o caminho: /api/../../etc/passwd vira /etc/passwd,
    // que vai para os arquivos estáticos (onde não existe nada parecido).
    const resposta = await pedir('/api/../../etc/passwd');
    assert.equal(await resposta.text(), '<html>página estática</html>');
    const codificado = await pedir('/api/%2e%2e/%2e%2e/etc/passwd');
    assert.equal(await codificado.text(), '<html>página estática</html>');
  });

  it('método errado responde 405 com Allow', async () => {
    const resposta = await pedir('/api/criar-pagamento');
    assert.equal(resposta.status, 405);
    assert.equal(resposta.headers.get('allow'), 'POST');
  });

  it('POST vindo de outro site é recusado (CSRF)', async () => {
    const resposta = await pedir('/api/acesso', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.com' },
      body: '{}',
    });
    assert.equal(resposta.status, 403);
  });

  it('webhook sem assinatura é recusado com 401', async () => {
    console.warn = console.log = () => {};
    const resposta = await pedir('/api/webhook-mercadopago?data.id=1&type=payment', { method: 'POST', body: '{}' });
    assert.equal(resposta.status, 401);
  });

  it('código inválido no acesso responde 404 sem detalhes', async () => {
    const resposta = await pedir('/api/acesso', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://seu-dominio.com.br', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ codigo: 'x'.repeat(43) }),
    });
    assert.equal(resposta.status, 404);
    assert.deepEqual(await resposta.json(), { erro: 'Este link de acesso não é válido.' });
  });

  it('configuração incompleta vira 500 genérico (sem listar o que falta para o visitante)', async () => {
    console.error = () => {};
    const env = criarEnv();
    delete env.SEGREDO_DO_SERVIDOR;
    const resposta = await pedir('/api/acesso', { method: 'POST', headers: { origin: 'https://seu-dominio.com.br' }, body: '{}' }, env);
    assert.equal(resposta.status, 500);
    assert.ok(!(await resposta.text()).includes('SEGREDO'));
  });
});

describe('pré-lançamento (sem Mercado Pago e e-mail cadastrados)', () => {
  /** Como fica o Worker logo depois do primeiro deploy: só o obrigatório. */
  function criarEnvDePreLancamento(opcoes) {
    const env = criarEnv(opcoes);
    for (const nome of ['MERCADOPAGO_TOKEN_DE_ACESSO', 'MERCADOPAGO_SEGREDO_DO_WEBHOOK', 'AWS_ID_DA_CHAVE_DE_ACESSO', 'AWS_CHAVE_SECRETA']) {
      delete env[nome];
    }
    return env;
  }
  const postar = (caminho, corpo, env) =>
    pedir(caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://seu-dominio.com.br' },
      body: JSON.stringify(corpo),
    }, env);

  it('a compra avisa que as vendas abrem em breve (503), sem erro técnico', async () => {
    console.warn = () => {};
    const resposta = await postar('/api/criar-pagamento', { nome: 'Ana', email: 'ana@exemplo.com', aceitouTermos: true }, criarEnvDePreLancamento());
    assert.equal(resposta.status, 503);
    assert.deepEqual(await resposta.json(), { erro: 'As vendas abrem em breve. Volte daqui a pouco!' });
  });

  it('o reenvio de link avisa que ainda não está disponível, igual para qualquer e-mail', async () => {
    const resposta = await postar('/api/reenviar-acesso', { email: 'ana@exemplo.com' }, criarEnvDePreLancamento());
    assert.equal(resposta.status, 503);
  });

  it('o webhook responde 503 enquanto o Mercado Pago não está cadastrado', async () => {
    const resposta = await pedir('/api/webhook-mercadopago?data.id=1&type=payment', { method: 'POST', body: '{}' }, criarEnvDePreLancamento());
    assert.equal(resposta.status, 503);
  });

  it('a página do comprador e os downloads funcionam', async () => {
    const env = criarEnvDePreLancamento({ arquivos: { 'vol-01/essential-drum-kit.zip': 'zip' } });
    const pedidos = criarRepositorioDePedidos(env.BANCO);
    const codigo = gerarCodigoDeAcesso();
    const { id } = await pedidos.criar({ nome: 'Ana', email: 'ana@exemplo.com', valorEmCentavos: 4990 });
    await pedidos.aprovar({ id, idDoPagamento: '1', hashDoCodigo: hashDoCodigo(codigo) });

    const acesso = await (await postar('/api/acesso', { codigo }, env)).json();
    assert.equal(acesso.nome, 'Ana');
    assert.equal(acesso.arquivos.length, 4);

    const { endereco } = await (await postar('/api/link-download', { codigo, arquivo: 'drums' }, env)).json();
    const download = await pedir(endereco.replace('https://seu-dominio.com.br', ''), {}, env);
    assert.equal(await download.text(), 'zip');
  });

  it('as páginas do site continuam no ar', async () => {
    assert.equal(await (await pedir('/', {}, criarEnvDePreLancamento())).text(), '<html>página estática</html>');
  });
});

describe('monitoramento', () => {
  /** ctx parecido com o da Cloudflare: guarda o que foi passado para waitUntil. */
  function criarCtx() {
    const tarefas = [];
    return { tarefas, waitUntil: (promessa) => tarefas.push(promessa) };
  }

  it('/api/saude responde 200 quando o banco responde e as vendas estão abertas', async () => {
    const resposta = await pedir('/api/saude');
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { situacao: 'ok' });
    assert.equal(resposta.headers.get('cache-control'), 'no-store');
  });

  it('/api/saude responde 503, sem detalhes, quando as vendas estão fechadas', async () => {
    console.warn = () => {};
    const env = criarEnv();
    delete env.MERCADOPAGO_TOKEN_DE_ACESSO;
    delete env.MERCADOPAGO_SEGREDO_DO_WEBHOOK;
    const resposta = await pedir('/api/saude', {}, env);
    assert.equal(resposta.status, 503);
    assert.deepEqual(await resposta.json(), { situacao: 'com-problema' });
  });

  it('um alerta na requisição vira e-mail para EMAIL_DE_ALERTAS, depois da resposta', async () => {
    console.warn = console.log = () => {};
    retirarAlertas();
    const fetchOriginal = globalThis.fetch;
    const enviados = [];
    globalThis.fetch = async (url, opcoes) => {
      enviados.push({ url, corpo: JSON.parse(opcoes.body) });
      return new Response('{"MessageId":"m"}');
    };
    try {
      const env = { ...criarEnv(), EMAIL_DE_ALERTAS: 'dono@exemplo.com' };
      const ctx = criarCtx();
      const resposta = await worker.fetch(
        new Request('https://seu-dominio.com.br/api/webhook-mercadopago?data.id=1&type=payment', { method: 'POST', body: '{}' }),
        env,
        ctx,
      );
      assert.equal(resposta.status, 401);
      await Promise.all(ctx.tarefas);

      assert.equal(enviados.length, 1);
      assert.match(enviados[0].url, /email\.sa-east-1\.amazonaws\.com/);
      assert.deepEqual(enviados[0].corpo.Destination.ToAddresses, ['dono@exemplo.com']);
      assert.equal(enviados[0].corpo.Content.Simple.Subject.Data, '[The Sir Vault] alerta: webhook-assinatura-invalida');
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('sem EMAIL_DE_ALERTAS, a fila é esvaziada e nada é enviado', async () => {
    console.warn = () => {};
    const ctx = criarCtx();
    await worker.fetch(new Request('https://seu-dominio.com.br/api/webhook-mercadopago?data.id=1&type=payment', { method: 'POST', body: '{}' }), criarEnv(), ctx);
    await Promise.all(ctx.tarefas);
    assert.deepEqual(retirarAlertas(), []);
  });
});

describe('agendador diário', () => {
  it('scheduled roda a limpeza sem erro', async () => {
    console.log = () => {};
    await worker.scheduled({ cron: '0 6 * * *' }, criarEnv());
  });
});

describe('rota de download', () => {
  it('link inválido leva de volta à página do comprador com aviso', async () => {
    const resposta = await baixar(new Request('https://seu-dominio.com.br/api/baixar?pedido=x&arquivo=drums&expira=1&assinatura=0'), criarEnv());
    assert.equal(resposta.status, 303);
    assert.equal(resposta.headers.get('location'), 'https://seu-dominio.com.br/comprador?download=expirado');
  });

  it('o redirecionamento usa o endereço do site, não o Host que o visitante mandou', async () => {
    const resposta = await baixar(new Request('https://site-falso.com/api/baixar?pedido=x'), criarEnv());
    assert.equal(resposta.headers.get('location'), 'https://seu-dominio.com.br/comprador?download=expirado');
  });

  it('do link pessoal até o arquivo: inteiro, por trecho e com Range inválido', async () => {
    const conteudoDoZip = '0123456789'.repeat(10);
    const env = criarEnv({ arquivos: { 'vol-01/essential-drum-kit.zip': conteudoDoZip } });
    const pedidos = criarRepositorioDePedidos(env.BANCO);
    const codigo = gerarCodigoDeAcesso();
    const { id } = await pedidos.criar({ nome: 'Ana', email: 'ana@exemplo.com', valorEmCentavos: 4990 });
    await pedidos.aprovar({ id, idDoPagamento: '1', hashDoCodigo: hashDoCodigo(codigo) });

    const pedirLink = await pedir('/api/link-download', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://seu-dominio.com.br' },
      body: JSON.stringify({ codigo, arquivo: 'drums' }),
    }, env);
    const { endereco } = await pedirLink.json();
    const caminho = endereco.replace('https://seu-dominio.com.br', '');

    const inteiro = await pedir(caminho, {}, env);
    assert.equal(inteiro.status, 200);
    assert.equal(inteiro.headers.get('content-length'), '100');
    assert.equal(inteiro.headers.get('content-disposition'), 'attachment; filename="the-sir-vault-drums.zip"');
    assert.equal(await inteiro.text(), conteudoDoZip);

    const trecho = await pedir(caminho, { headers: { range: 'bytes=10-19' } }, env);
    assert.equal(trecho.status, 206);
    assert.equal(trecho.headers.get('content-range'), 'bytes 10-19/100');
    assert.equal(trecho.headers.get('content-length'), '10');
    assert.equal(await trecho.text(), '0123456789');

    const final = await pedir(caminho, { headers: { range: 'bytes=-5' } }, env);
    assert.equal(final.headers.get('content-range'), 'bytes 95-99/100');

    const invalido = await pedir(caminho, { headers: { range: 'bytes=500-' } }, env);
    assert.equal(invalido.status, 200, 'R2 manda o arquivo inteiro, então é 200 e não 206');
    assert.equal(invalido.headers.get('content-range'), null);
  });
});

describe('trecho pedido (formato do objeto do R2)', () => {
  const tamanho = 100;
  it('lê offset e length mesmo com suffix: undefined', () => {
    assert.deepEqual(trechoPedido({ size: tamanho, range: { offset: 10, length: 5, suffix: undefined } }, true), { inicio: 10, fim: 14 });
  });
  it('lê suffix (últimos N bytes)', () => {
    assert.deepEqual(trechoPedido({ size: tamanho, range: { suffix: 20 } }, true), { inicio: 80, fim: 99 });
  });
  it('sem Range, ou com o arquivo inteiro, não é trecho', () => {
    assert.equal(trechoPedido({ size: tamanho, range: { offset: 0, length: 100 } }, false), null);
    assert.equal(trechoPedido({ size: tamanho, range: { offset: 0, length: 100 } }, true), null);
    assert.equal(trechoPedido({ size: tamanho, range: undefined }, true), null);
  });
});
