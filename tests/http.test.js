import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { comDuracaoMinima, criarRota, exigirMesmaOrigem, ipDoCliente, lerCorpoJson } from '../servidor/http.js';
import { ErroDeEntrada, ErroDeOrigem, ErroDeTamanho } from '../servidor/erros.js';

const SITE = 'https://seu-dominio.com.br';

function requisicao(corpo, cabecalhos = {}) {
  return new Request(`${SITE}/api/teste`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, ...cabecalhos },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

describe('lerCorpoJson', () => {
  it('lê um objeto JSON', async () => {
    assert.deepEqual(await lerCorpoJson(requisicao({ a: 1 })), { a: 1 });
  });

  it('recusa corpo maior que 10 KB', async () => {
    await assert.rejects(lerCorpoJson(requisicao({ a: 'x'.repeat(11_000) })), ErroDeTamanho);
  });

  it('recusa JSON inválido, listas e valores soltos', async () => {
    for (const corpo of ['{quebrado', '[1,2]', '"texto"', 'null', '42']) {
      await assert.rejects(lerCorpoJson(requisicao(corpo)), ErroDeEntrada, corpo);
    }
  });

  it('recusa quando o Content-Type não é JSON', async () => {
    await assert.rejects(lerCorpoJson(requisicao('a=1', { 'content-type': 'application/x-www-form-urlencoded' })), ErroDeEntrada);
  });
});

describe('exigirMesmaOrigem (CSRF)', () => {
  it('aceita o nosso site', () => {
    assert.doesNotThrow(() => exigirMesmaOrigem(requisicao({}), SITE));
  });

  it('recusa outro site, subdomínio parecido ou sem Origin', () => {
    for (const origin of ['https://site-malicioso.com', 'https://seu-dominio.com.br.evil.com', 'http://seu-dominio.com.br', 'null']) {
      assert.throws(() => exigirMesmaOrigem(requisicao({}, { origin }), SITE), ErroDeOrigem, origin);
    }
    const semOrigem = new Request(`${SITE}/api/teste`, { method: 'POST', body: '{}' });
    assert.throws(() => exigirMesmaOrigem(semOrigem, SITE), ErroDeOrigem);
  });
});

describe('criarRota', () => {
  it('erro inesperado vira 500 sem vazar detalhes internos', async () => {
    const rota = criarRota('teste', async () => {
      throw new Error('senha do banco: 123 em /var/task/lib/x.js');
    });
    const originalError = console.error;
    console.error = () => {};
    const resposta = await rota(requisicao({}));
    console.error = originalError;

    assert.equal(resposta.status, 500);
    const texto = await resposta.text();
    assert.ok(!texto.includes('senha'));
    assert.ok(!texto.includes('/var/task'));
    assert.equal(resposta.headers.get('cache-control'), 'no-store');
  });

  it('erro conhecido vira o status e a mensagem dele', async () => {
    const rota = criarRota('teste', async () => {
      throw new ErroDeEntrada('Digite um e-mail válido.');
    });
    const originalLog = console.log;
    console.log = () => {};
    const resposta = await rota(requisicao({}));
    console.log = originalLog;
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), { erro: 'Digite um e-mail válido.' });
  });
});

describe('ipDoCliente', () => {
  it('usa o cabeçalho da Cloudflare e ignora x-forwarded-for (que o visitante pode forjar)', () => {
    assert.equal(ipDoCliente(requisicao({}, { 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '1.1.1.1' })), '200.1.2.3');
    assert.equal(ipDoCliente(requisicao({}, { 'x-forwarded-for': '1.1.1.1' })), 'desconhecido');
  });
});

describe('comDuracaoMinima', () => {
  it('espera o tempo mínimo mesmo quando a tarefa é rápida', async () => {
    const inicio = Date.now();
    await comDuracaoMinima(120, async () => 'pronto');
    assert.ok(Date.now() - inicio >= 115);
  });
});
