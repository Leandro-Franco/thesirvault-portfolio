import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, retirarAlertas } from '../servidor/registro.js';
import { criarServicoDeAlertas, montarAlerta } from '../servidor/servicos/alertas.js';
import { criarEmailFalso, criarLimitadorFalso } from './falsos.js';

beforeEach(() => {
  console.log = console.warn = console.error = () => {};
  retirarAlertas(); // começa com a fila vazia
});

describe('fila de alertas do log', () => {
  it('só "erro" e "alerta" entram na fila; "info" não', () => {
    registrar('info', 'pedido-criado', { pedido: 'p1' });
    registrar('alerta', 'valor-divergente', { pedido: 'p2' });
    registrar('erro', 'falha-inesperada', { rota: 'acesso' });
    assert.deepEqual(retirarAlertas().map((r) => r.evento), ['valor-divergente', 'falha-inesperada']);
    assert.deepEqual(retirarAlertas(), [], 'retirar esvazia a fila');
  });

  it('alertar: false registra no log sem entrar na fila', () => {
    registrar('erro', 'alerta-nao-enviado', {}, { alertar: false });
    assert.deepEqual(retirarAlertas(), []);
  });

  it('uma rajada de erros não cresce a fila sem fim', () => {
    for (let i = 0; i < 100; i++) registrar('erro', 'falha-inesperada', { i });
    assert.equal(retirarAlertas().length, 20);
  });
});

describe('e-mail de alerta', () => {
  let email, limitador, alertas;
  beforeEach(() => {
    email = criarEmailFalso();
    limitador = criarLimitadorFalso();
    alertas = criarServicoDeAlertas({ email, limitador, para: 'dono@exemplo.com' });
  });

  it('explica o evento e leva os detalhes do log', () => {
    const { assunto, texto } = montarAlerta({ nivel: 'alerta', evento: 'pagamento-duplicado', momento: '2026-11-12T23:00:00.000Z', pedido: 'p1', pagamento: '99' });
    assert.equal(assunto, '[The Sir Vault] alerta: pagamento-duplicado');
    assert.match(texto, /Reembolse o segundo pagamento/);
    assert.match(texto, /"pagamento": "99"/);
    assert.match(texto, /2026-11-12T23:00:00.000Z/);
  });

  it('evento sem explicação cadastrada ainda chega, com os detalhes', () => {
    const { texto } = montarAlerta({ nivel: 'erro', evento: 'evento-novo', momento: 'agora', x: 1 });
    assert.match(texto, /sem explicação cadastrada/);
    assert.match(texto, /"x": 1/);
  });

  it('no máximo 1 e-mail por tipo de evento por hora', async () => {
    registrar('erro', 'falha-inesperada', { rota: 'acesso' });
    registrar('erro', 'falha-inesperada', { rota: 'acesso' });
    registrar('alerta', 'valor-divergente', { pedido: 'p1' });
    await alertas.enviar(retirarAlertas());
    registrar('erro', 'falha-inesperada', { rota: 'baixar' });
    await alertas.enviar(retirarAlertas());

    assert.deepEqual(
      email.mensagens.map((m) => [m.para, m.assunto]),
      [
        ['dono@exemplo.com', '[The Sir Vault] erro: falha-inesperada'],
        ['dono@exemplo.com', '[The Sir Vault] alerta: valor-divergente'],
      ],
    );
  });

  it('se o banco do limite falhar, avisa mesmo assim (é quando mais importa)', async () => {
    limitador.exigir = async () => {
      throw new Error('D1 fora do ar');
    };
    await alertas.enviar([{ nivel: 'erro', evento: 'falha-inesperada', momento: 'agora' }]);
    assert.equal(email.mensagens.length, 1);
  });

  it('falha no envio do alerta fica no log, sem gerar outro alerta (sem ciclo)', async () => {
    const linhas = [];
    console.error = (linha) => linhas.push(JSON.parse(linha));
    email.falharNaProxima = true;
    await alertas.enviar([{ nivel: 'erro', evento: 'falha-inesperada', momento: 'agora' }]);

    assert.equal(email.mensagens.length, 0);
    assert.deepEqual(retirarAlertas(), []);
    assert.equal(linhas[0].evento, 'alerta-nao-enviado');
    assert.equal(linhas[0].eventoDoAlerta, 'falha-inesperada');
  });
});
