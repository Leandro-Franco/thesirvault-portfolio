import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarCasoCriarPedido } from '../servidor/casos-de-uso/criar-pedido.js';
import { criarCasoProcessarPagamento } from '../servidor/casos-de-uso/processar-pagamento.js';
import { hashDoCodigo } from '../servidor/seguranca.js';
import { ErroDeEntrada, ErroDeLimite } from '../servidor/erros.js';
import { pacote } from '../src/conteudo/pacote.js';
import { codigoDoLink, criarEmailFalso, criarLimitadorFalso, criarPagamentosFalso, criarPedidosFalso } from './falsos.js';

const urlDoSite = 'https://seu-dominio.com.br';
const silenciar = () => {
  const original = { log: console.log, warn: console.warn };
  console.log = console.warn = () => {};
  return () => Object.assign(console, original);
};

let pedidos, pagamentos, email, limitador, criarPedido, processarPagamento, restaurarConsole;

beforeEach(() => {
  pedidos = criarPedidosFalso();
  pagamentos = criarPagamentosFalso();
  email = criarEmailFalso();
  limitador = criarLimitadorFalso();
  criarPedido = criarCasoCriarPedido({ pedidos, pagamentos, limitador, urlDoSite });
  processarPagamento = criarCasoProcessarPagamento({ pedidos, pagamentos, email, urlDoSite });
  restaurarConsole?.();
  restaurarConsole = silenciar();
});

const dadosValidos = { nome: 'Ana Souza', email: 'ana@exemplo.com', aceitouTermos: true, visitante: 'v1' };

async function pedidoPendente() {
  await criarPedido(dadosValidos);
  return [...pedidos.linhas.values()][0];
}

function pagamentoAprovado(pedido, mudancas = {}) {
  const pagamento = { id: '555', situacao: 'aprovado', idDoPedido: pedido.id, valorEmCentavos: pedido.valorEmCentavos, moeda: 'BRL', ...mudancas };
  pagamentos.definirPagamento(pagamento);
  return pagamento;
}

describe('criar pedido', () => {
  it('cria pedido pendente com o preço do servidor e devolve o checkout', async () => {
    const { enderecoDoCheckout } = await criarPedido(dadosValidos);
    const pedido = [...pedidos.linhas.values()][0];

    assert.equal(pedido.status, 'pendente');
    assert.equal(pedido.valorEmCentavos, pacote.precoEmCentavos);
    assert.match(enderecoDoCheckout, /^https:\/\/www\.mercadopago\.com\.br\//);
    assert.equal(pagamentos.checkouts[0].urlDoSite, urlDoSite);
  });

  it('ignora preço enviado pelo navegador (adulteração de preço)', async () => {
    await criarPedido({ ...dadosValidos, valorEmCentavos: 1, precoEmCentavos: 1, preco: 0.01 });
    const pedido = [...pedidos.linhas.values()][0];
    assert.equal(pedido.valorEmCentavos, pacote.precoEmCentavos);
  });

  it('exige aceite dos termos', async () => {
    await assert.rejects(criarPedido({ ...dadosValidos, aceitouTermos: false }), ErroDeEntrada);
    assert.equal(pedidos.linhas.size, 0);
  });

  it('bloqueia o mesmo visitante depois de 10 pedidos na hora (robôs)', async () => {
    for (let i = 0; i < 10; i++) await criarPedido(dadosValidos);
    await assert.rejects(criarPedido(dadosValidos), ErroDeLimite);
  });
});

describe('processar pagamento (webhook)', () => {
  it('pagamento aprovado: aprova, guarda só o hash e envia o link uma vez', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido);

    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'aprovado');
    const salvo = pedidos.linhas.get(pedido.id);
    assert.equal(salvo.status, 'aprovado');
    assert.equal(email.enviados.length, 1);

    const codigo = codigoDoLink(email.enviados[0].link);
    assert.equal(salvo.codigoHash, hashDoCodigo(codigo));
    assert.notEqual(salvo.codigoHash, codigo);
    assert.ok(email.enviados[0].link.startsWith(`${urlDoSite}/comprador#codigo=`));
  });

  it('aviso repetido (replay) não aprova de novo nem manda outro e-mail', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido);

    await processarPagamento({ idDoPagamento: '555' });
    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'ja-processado');
    assert.equal(email.enviados.length, 1);
  });

  it('valor pago diferente do pedido: não aprova', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido, { valorEmCentavos: pedido.valorEmCentavos - 1 });

    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'valor-divergente');
    assert.equal(pedidos.linhas.get(pedido.id).status, 'pendente');
    assert.equal(email.enviados.length, 0);
  });

  it('moeda diferente: não aprova', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido, { moeda: 'USD' });
    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'valor-divergente');
  });

  it('pagamento de pedido que não existe: ignora', async () => {
    pagamentos.definirPagamento({ id: '777', situacao: 'aprovado', idDoPedido: 'nao-existe', valorEmCentavos: 4990, moeda: 'BRL' });
    assert.equal(await processarPagamento({ idDoPagamento: '777' }), 'ignorado');
  });

  it('reembolso ou estorno: corta o acesso', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido);
    await processarPagamento({ idDoPagamento: '555' });

    pagamentos.definirPagamento({ id: '555', situacao: 'reembolsado', idDoPedido: pedido.id, valorEmCentavos: pedido.valorEmCentavos, moeda: 'BRL' });
    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'revogado');
    const salvo = pedidos.linhas.get(pedido.id);
    assert.equal(salvo.status, 'reembolsado');
    assert.equal(salvo.codigoHash, null);
  });

  it('pagamento pendente ou recusado: não muda nada', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido, { situacao: 'outro' });
    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'sem-mudanca');
    assert.equal(pedidos.linhas.get(pedido.id).status, 'pendente');
  });

  it('segundo pagamento para o mesmo pedido: não reenvia nada e gera alerta', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido);
    await processarPagamento({ idDoPagamento: '555' });

    pagamentos.definirPagamento({ id: '556', situacao: 'aprovado', idDoPedido: pedido.id, valorEmCentavos: pedido.valorEmCentavos, moeda: 'BRL' });
    assert.equal(await processarPagamento({ idDoPagamento: '556' }), 'pagamento-duplicado');
    assert.equal(email.enviados.length, 1);
  });

  it('se o e-mail falhar, a próxima tentativa do Mercado Pago reenvia com código novo', async () => {
    const pedido = await pedidoPendente();
    pagamentoAprovado(pedido);

    email.falharNaProxima = true;
    await assert.rejects(processarPagamento({ idDoPagamento: '555' }));
    assert.equal(pedidos.linhas.get(pedido.id).status, 'aprovado');
    assert.equal(email.enviados.length, 0);

    assert.equal(await processarPagamento({ idDoPagamento: '555' }), 'email-reenviado');
    assert.equal(email.enviados.length, 1);
    const codigo = codigoDoLink(email.enviados[0].link);
    assert.equal(pedidos.linhas.get(pedido.id).codigoHash, hashDoCodigo(codigo));
  });
});
