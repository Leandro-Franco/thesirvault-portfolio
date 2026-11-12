import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarCasoConsultarAcesso } from '../servidor/casos-de-uso/consultar-acesso.js';
import { criarCasoGerarLinkDeDownload } from '../servidor/casos-de-uso/gerar-link-de-download.js';
import { criarCasoBaixarArquivo } from '../servidor/casos-de-uso/baixar-arquivo.js';
import { criarCasoReenviarAcesso, MENSAGEM_DE_REENVIO } from '../servidor/casos-de-uso/reenviar-acesso.js';
import { gerarCodigoDeAcesso, hashDoCodigo } from '../servidor/seguranca.js';
import { ErroDeAcesso, ErroDeEntrada, ErroDeLimite, ErroDeLinkDeDownload } from '../servidor/erros.js';
import {
  codigoDoLink,
  criarArquivosFalso,
  criarServicoDeLinksDeDownload,
  criarDownloadsFalso,
  criarEmailFalso,
  criarLimitadorFalso,
  criarPedidosFalso,
} from './falsos.js';

const urlDoSite = 'https://seu-dominio.com.br';
let pedidos, limitador, email, arquivos, links, downloads, consultarAcesso, gerarLinkDeDownload, baixarArquivo, reenviarAcesso;
let relogio; // segundos, controlado pelo teste
let codigo, pedido;

beforeEach(async () => {
  console.log = () => {};
  pedidos = criarPedidosFalso();
  limitador = criarLimitadorFalso();
  email = criarEmailFalso();
  relogio = 1_800_000_000;
  arquivos = criarArquivosFalso({ 'vol-01/essential-drum-kit.zip': 'conteudo-do-zip' });
  links = criarServicoDeLinksDeDownload({ urlDoSite, chave: 'chave-de-teste', agoraEmSegundos: () => relogio });
  downloads = criarDownloadsFalso();
  consultarAcesso = criarCasoConsultarAcesso({ pedidos, limitador });
  gerarLinkDeDownload = criarCasoGerarLinkDeDownload({ pedidos, downloads, links, limitador });
  baixarArquivo = criarCasoBaixarArquivo({ pedidos, links, arquivos, limitador });
  reenviarAcesso = criarCasoReenviarAcesso({ pedidos, email, limitador, urlDoSite });

  // Um pedido já aprovado, com código conhecido
  pedido = await pedidos.criar({ nome: 'Ana', email: 'ana@exemplo.com', valorEmCentavos: 4990 });
  codigo = gerarCodigoDeAcesso();
  await pedidos.aprovar({ id: pedido.id, idDoPagamento: '1', hashDoCodigo: hashDoCodigo(codigo) });
});

describe('consultar acesso', () => {
  it('código válido devolve nome e arquivos, sem caminhos internos', async () => {
    const acesso = await consultarAcesso({ codigo, visitante: 'v' });
    assert.equal(acesso.nome, 'Ana');
    assert.deepEqual(acesso.arquivos.map((a) => a.id), ['presets', 'projects', 'drums', 'videoaulas']);
    assert.ok(!JSON.stringify(acesso).includes('vol-01/'), 'não pode expor o caminho no Storage');
  });

  it('código inexistente, malformado ou de outra pessoa: mesma resposta', async () => {
    for (const tentativa of [gerarCodigoDeAcesso(), 'curto', `${codigo.slice(0, -1)}X`, "' OR '1'='1", undefined]) {
      await assert.rejects(consultarAcesso({ codigo: tentativa, visitante: 'v' }), ErroDeAcesso);
    }
  });

  it('pedido pendente não tem acesso, mesmo com código no banco', async () => {
    const pendente = await pedidos.criar({ nome: 'Bia', email: 'bia@exemplo.com', valorEmCentavos: 4990 });
    const codigoDaBia = gerarCodigoDeAcesso();
    pedidos.linhas.get(pendente.id).codigoHash = hashDoCodigo(codigoDaBia);
    await assert.rejects(consultarAcesso({ codigo: codigoDaBia, visitante: 'v' }), ErroDeAcesso);
  });

  it('pedido reembolsado perde o acesso', async () => {
    await pedidos.marcarReembolsado(pedido.id);
    await assert.rejects(consultarAcesso({ codigo, visitante: 'v' }), ErroDeAcesso);
  });

  it('força bruta: bloqueia o visitante depois de 30 tentativas em 10 minutos', async () => {
    for (let i = 0; i < 30; i++) {
      await consultarAcesso({ codigo: gerarCodigoDeAcesso(), visitante: 'atacante' }).catch(() => {});
    }
    await assert.rejects(consultarAcesso({ codigo, visitante: 'atacante' }), ErroDeLimite);
  });
});

describe('link de download', () => {
  const baixarPeloLink = (endereco, visitante = 'v') =>
    baixarArquivo({ parametros: new URL(endereco).searchParams, cabecalhos: new Headers(), visitante });

  it('gera link assinado de 1 hora, registra e o link entrega o arquivo certo', async () => {
    const { endereco } = await gerarLinkDeDownload({ codigo, arquivo: 'drums', visitante: 'v' });
    assert.ok(endereco.startsWith(`${urlDoSite}/api/baixar?`));
    assert.deepEqual(downloads.registros[0], { idDoPedido: pedido.id, arquivo: 'drums' });

    const { conteudo, nomeDoArquivo } = await baixarPeloLink(endereco);
    assert.equal(await new Response(conteudo.body).text(), 'conteudo-do-zip');
    assert.equal(nomeDoArquivo, 'the-sir-vault-drums.zip');
    assert.deepEqual(arquivos.aberturas, ['vol-01/essential-drum-kit.zip']);
  });

  it('link vencido (depois de 1 hora) não baixa', async () => {
    const { endereco } = await gerarLinkDeDownload({ codigo, arquivo: 'drums', visitante: 'v' });
    relogio += 3601;
    await assert.rejects(baixarPeloLink(endereco), ErroDeLinkDeDownload);
  });

  it('link adulterado (outro arquivo, outro pedido ou prazo maior) não baixa', async () => {
    const { endereco } = await gerarLinkDeDownload({ codigo, arquivo: 'drums', visitante: 'v' });
    const adulterar = (campo, valor) => {
      const url = new URL(endereco);
      url.searchParams.set(campo, valor);
      return url.toString();
    };
    for (const link of [adulterar('arquivo', 'presets'), adulterar('pedido', 'outro-pedido'), adulterar('expira', String(relogio + 999_999)), adulterar('assinatura', '0'.repeat(64))]) {
      await assert.rejects(baixarPeloLink(link), ErroDeLinkDeDownload, link);
    }
    assert.equal(arquivos.aberturas.length, 0);
  });

  it('reembolso depois de gerar o link: o link para de funcionar', async () => {
    const { endereco } = await gerarLinkDeDownload({ codigo, arquivo: 'drums', visitante: 'v' });
    await pedidos.marcarReembolsado(pedido.id);
    await assert.rejects(baixarPeloLink(endereco), ErroDeLinkDeDownload);
  });

  it('não deixa pedir arquivo fora da lista (path traversal)', async () => {
    await assert.rejects(gerarLinkDeDownload({ codigo, arquivo: '../../outro-bucket/x', visitante: 'v' }), ErroDeEntrada);
    assert.equal(downloads.registros.length, 0);
  });

  it('sem código válido não gera link (controle de acesso)', async () => {
    await assert.rejects(gerarLinkDeDownload({ codigo: gerarCodigoDeAcesso(), arquivo: 'drums', visitante: 'v' }), ErroDeAcesso);
  });
});

describe('reenviar acesso', () => {
  it('com compra: troca o código, envia o novo e o antigo para de funcionar', async () => {
    const { mensagem } = await reenviarAcesso({ email: 'ANA@exemplo.com', visitante: 'v' });
    assert.equal(mensagem, MENSAGEM_DE_REENVIO);
    assert.equal(email.enviados.length, 1);

    const codigoNovo = codigoDoLink(email.enviados[0].link);
    assert.notEqual(codigoNovo, codigo);
    await assert.rejects(consultarAcesso({ codigo, visitante: 'v' }), ErroDeAcesso);
    assert.equal((await consultarAcesso({ codigo: codigoNovo, visitante: 'v' })).nome, 'Ana');
  });

  it('sem compra: mesma mensagem e nenhum e-mail (não revela quem comprou)', async () => {
    const { mensagem } = await reenviarAcesso({ email: 'ninguem@exemplo.com', visitante: 'v' });
    assert.equal(mensagem, MENSAGEM_DE_REENVIO);
    assert.equal(email.enviados.length, 0);
  });

  it('limita reenvios por e-mail (contra bombardeio de e-mails)', async () => {
    for (let i = 0; i < 3; i++) await reenviarAcesso({ email: 'ana@exemplo.com', visitante: `v${i}` });
    await assert.rejects(reenviarAcesso({ email: 'ana@exemplo.com', visitante: 'v9' }), ErroDeLimite);
    assert.equal(email.enviados.length, 3);
  });
});
