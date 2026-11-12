import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { criarD1Local } from './d1-local.js';
import { criarRepositorioDePedidos } from '../servidor/repositorios/pedidos.js';
import { criarRepositorioDeDownloads } from '../servidor/repositorios/downloads.js';
import { criarLimitador } from '../servidor/servicos/limitador.js';
import { ErroDeLimite } from '../servidor/erros.js';
import { hashDoCodigo, gerarCodigoDeAcesso } from '../servidor/seguranca.js';
import { criarCasoLimparDadosTemporarios } from '../servidor/casos-de-uso/limpar-dados-temporarios.js';
import { arquivosParaDownload } from '../servidor/entregaveis.js';

let banco, pedidos, downloads;

beforeEach(() => {
  banco = criarD1Local();
  pedidos = criarRepositorioDePedidos(banco);
  downloads = criarRepositorioDeDownloads(banco);
});

const novoPedido = () => pedidos.criar({ nome: 'Ana', email: 'ana@exemplo.com', valorEmCentavos: 4990 });

describe('repositório de pedidos (SQL real da migração)', () => {
  it('cria pendente e busca por id', async () => {
    const criado = await novoPedido();
    assert.equal(criado.status, 'pendente');
    assert.equal(criado.valorEmCentavos, 4990);
    assert.deepEqual(await pedidos.buscarPorId(criado.id), criado);
    assert.equal(await pedidos.buscarPorId('nao-existe'), null);
  });

  it('aprova uma única vez, mesmo chamado duas vezes', async () => {
    const { id } = await novoPedido();
    const hash = hashDoCodigo(gerarCodigoDeAcesso());

    assert.equal(await pedidos.aprovar({ id, idDoPagamento: '123', hashDoCodigo: hash }), true);
    assert.equal(await pedidos.aprovar({ id, idDoPagamento: '123', hashDoCodigo: hash }), false);

    const aprovado = await pedidos.buscarPorHashDoCodigo(hash);
    assert.equal(aprovado.status, 'aprovado');
    assert.equal(aprovado.idDoPagamento, '123');
    assert.equal((await pedidos.buscarAprovadoPorEmail('ana@exemplo.com')).id, id);
  });

  it('troca de código invalida o código antigo', async () => {
    const { id } = await novoPedido();
    const antigo = hashDoCodigo(gerarCodigoDeAcesso());
    const novo = hashDoCodigo(gerarCodigoDeAcesso());
    await pedidos.aprovar({ id, idDoPagamento: '1', hashDoCodigo: antigo });
    await pedidos.trocarCodigo({ id, hashDoCodigo: novo });

    assert.equal(await pedidos.buscarPorHashDoCodigo(antigo), null);
    assert.equal((await pedidos.buscarPorHashDoCodigo(novo)).id, id);
  });

  it('reembolso apaga o código e muda o status', async () => {
    const { id } = await novoPedido();
    const hash = hashDoCodigo(gerarCodigoDeAcesso());
    await pedidos.aprovar({ id, idDoPagamento: '1', hashDoCodigo: hash });
    await pedidos.marcarReembolsado(id);

    assert.equal(await pedidos.buscarPorHashDoCodigo(hash), null);
    assert.equal((await pedidos.buscarPorId(id)).status, 'reembolsado');
    assert.equal(await pedidos.buscarAprovadoPorEmail('ana@exemplo.com'), null);
  });

  it('marca o envio do e-mail', async () => {
    const { id } = await novoPedido();
    await pedidos.marcarEmailEnviado(id);
    assert.ok((await pedidos.buscarPorId(id)).emailEnviadoEm);
  });

  it('injeção de SQL nos parâmetros é tratada como texto comum', async () => {
    await novoPedido();
    assert.equal(await pedidos.buscarPorHashDoCodigo("' OR '1'='1"), null);
    assert.equal(await pedidos.buscarAprovadoPorEmail("x' OR 1=1 --"), null);
    assert.equal(await pedidos.buscarPorId("1; DROP TABLE pedidos; --"), null);
    assert.ok(await novoPedido(), 'a tabela continua lá');
  });
});

describe('regras do banco (última linha de defesa)', () => {
  const inserir = (campos) =>
    banco
      .prepare(
        `INSERT INTO pedidos (id, nome, email, status, valor_em_centavos, codigo_hash, criado_em, atualizado_em)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'agora', 'agora')`,
      )
      .bind(campos.id ?? crypto.randomUUID(), campos.nome ?? 'Ana', campos.email ?? 'ana@x.com', campos.status ?? 'pendente', campos.valor ?? 4990, campos.hash ?? null)
      .run();

  it('recusa status, valor, e-mail e hash fora do formato', async () => {
    await assert.rejects(inserir({ status: 'pago' }), /CHECK/);
    await assert.rejects(inserir({ valor: 0 }), /CHECK/);
    await assert.rejects(inserir({ valor: '49,90' }), /cannot store TEXT value in INTEGER column|datatype mismatch/);
    await assert.rejects(inserir({ email: 'ANA@X.COM' }), /CHECK/);
    await assert.rejects(inserir({ hash: 'codigo-em-texto-puro' }), /CHECK/);
  });

  it('não deixa dois pedidos com o mesmo código', async () => {
    const hash = 'a'.repeat(64);
    await inserir({ hash });
    await assert.rejects(inserir({ hash }), /UNIQUE/);
  });

  it('download só de arquivo conhecido e de pedido existente', async () => {
    const { id } = await novoPedido();
    await downloads.registrar({ idDoPedido: id, arquivo: 'drums' });
    await assert.rejects(downloads.registrar({ idDoPedido: id, arquivo: '../x' }), /CHECK/);
    await assert.rejects(downloads.registrar({ idDoPedido: 'nao-existe', arquivo: 'drums' }), /FOREIGN KEY/);
  });

  it('o banco aceita todos os arquivos de entregaveis.js (CHECK em dia com a lista)', async () => {
    const { id } = await novoPedido();
    for (const arquivo of arquivosParaDownload) {
      await downloads.registrar({ idDoPedido: id, arquivo: arquivo.id });
    }
  });

  it('a migração 0002 mantém os downloads já registrados', () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON;');
    const migracao = (nome) => readFileSync(new URL(`../banco/migracoes/${nome}`, import.meta.url), 'utf8');
    sqlite.exec(migracao('0001_estrutura_inicial.sql'));
    sqlite
      .prepare("INSERT INTO pedidos (id, nome, email, status, valor_em_centavos, criado_em, atualizado_em) VALUES ('p1', 'Ana', 'ana@x.com', 'pendente', 4990, '2026-11-12T00:00:00Z', '2026-11-12T00:00:00Z')")
      .run();
    sqlite.prepare("INSERT INTO downloads (id, pedido_id, arquivo, baixado_em) VALUES ('d1', 'p1', 'drums', '2026-11-12T00:00:00Z')").run();

    sqlite.exec(migracao('0002_videoaulas_para_download.sql'));

    assert.deepEqual({ ...sqlite.prepare('SELECT id, pedido_id, arquivo FROM downloads').get() }, { id: 'd1', pedido_id: 'p1', arquivo: 'drums' });
    sqlite.prepare("INSERT INTO downloads (id, pedido_id, arquivo, baixado_em) VALUES ('d2', 'p1', 'videoaulas', '2026-11-12T00:00:00Z')").run();
    assert.throws(() => sqlite.prepare("INSERT INTO downloads (id, pedido_id, arquivo, baixado_em) VALUES ('d3', 'p1', 'outro', '2026-11-12T00:00:00Z')").run(), /CHECK/);
    assert.throws(() => sqlite.prepare("INSERT INTO downloads (id, pedido_id, arquivo, baixado_em) VALUES ('d4', 'nao-existe', 'drums', '2026-11-12T00:00:00Z')").run(), /FOREIGN KEY/);
  });
});

describe('limitador (SQL real)', () => {
  it('deixa passar até o máximo e bloqueia depois, por janela', async () => {
    let agora = 1_000_000;
    const limitador = criarLimitador(banco, { agoraEmSegundos: () => agora });

    for (let i = 0; i < 3; i++) await limitador.exigir('teste', 3, 60);
    await assert.rejects(limitador.exigir('teste', 3, 60), ErroDeLimite);

    // Outra chave não é afetada
    await limitador.exigir('outra', 3, 60);

    // Na próxima janela, volta a deixar e apaga a janela antiga
    agora += 60;
    await limitador.exigir('teste', 3, 60);
    const linhas = banco.sqlite.prepare("SELECT COUNT(*) AS n FROM limites_de_uso WHERE chave = 'teste'").get();
    assert.equal(linhas.n, 1);
  });
});

describe('limpeza diária (SQL real)', () => {
  it('apaga contagens velhas e pedidos nunca pagos, e mantém o resto', async () => {
    const agora = new Date('2026-12-31T12:00:00.000Z');
    const agoraEmSegundos = Math.floor(agora.getTime() / 1000);
    const limitador = criarLimitador(banco, { agoraEmSegundos: () => agoraEmSegundos });
    const diasAtras = (dias) => () => new Date(agora.getTime() - dias * 86_400_000).toISOString();

    // Contagens: uma de 2 dias atrás (some) e uma de agora (fica)
    const limitadorAntigo = criarLimitador(banco, { agoraEmSegundos: () => agoraEmSegundos - 2 * 86_400 });
    await limitadorAntigo.exigir('visitante-que-sumiu', 5, 3600);
    await limitador.exigir('visitante-de-hoje', 5, 3600);

    // Pedidos: pendente de 31 dias (some), pendente de 2 dias (fica), aprovado de 60 dias (fica)
    const antigos = criarRepositorioDePedidos(banco, { agora: diasAtras(31) });
    const recentes = criarRepositorioDePedidos(banco, { agora: diasAtras(2) });
    const muitoAntigos = criarRepositorioDePedidos(banco, { agora: diasAtras(60) });
    const abandonado = await antigos.criar({ nome: 'Bia', email: 'bia@exemplo.com', valorEmCentavos: 4990 });
    const aguardando = await recentes.criar({ nome: 'Caio', email: 'caio@exemplo.com', valorEmCentavos: 4990 });
    const vendido = await muitoAntigos.criar({ nome: 'Duda', email: 'duda@exemplo.com', valorEmCentavos: 4990 });
    await muitoAntigos.aprovar({ id: vendido.id, idDoPagamento: '9', hashDoCodigo: hashDoCodigo(gerarCodigoDeAcesso()) });

    const limpar = criarCasoLimparDadosTemporarios({ pedidos, limitador, agora: () => agora });
    assert.deepEqual(await limpar(), { contagensApagadas: 1, pedidosApagados: 1 });

    assert.equal(await pedidos.buscarPorId(abandonado.id), null);
    assert.ok(await pedidos.buscarPorId(aguardando.id));
    assert.equal((await pedidos.buscarPorId(vendido.id)).status, 'aprovado');
    const chaves = banco.sqlite.prepare('SELECT chave FROM limites_de_uso').all().map((linha) => linha.chave);
    assert.deepEqual(chaves, ['visitante-de-hoje']);
  });
});
