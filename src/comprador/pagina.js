import { chamarApi } from '../comum/api.js';
import { criarAvisos } from '../interface/avisos.js';

/**
 * Página do comprador (comprador.html).
 *
 * O link do e-mail tem o formato  /comprador#codigo=XXXX
 * O código fica depois do "#" de propósito: essa parte do endereço nunca é
 * enviada ao servidor nem aparece em logs ou no Referer de outros sites.
 * Nós lemos o código aqui e mandamos para a API no corpo da requisição.
 */

const elementos = {
  retorno: document.getElementById('retorno-do-pagamento'),
  carregando: document.getElementById('carregando'),
  areaDoCliente: document.getElementById('area-do-cliente'),
  nomeDoCliente: document.getElementById('nome-do-cliente'),
  listaDeArquivos: document.getElementById('lista-de-arquivos'),
  recuperarAcesso: document.getElementById('recuperar-acesso'),
  motivoDaRecuperacao: document.getElementById('motivo-da-recuperacao'),
  formularioRecuperar: document.getElementById('formulario-recuperar'),
};

const avisar = criarAvisos(document.getElementById('aviso'));

const MENSAGENS_DE_RETORNO = {
  aprovado: 'Pagamento aprovado! Seu link de acesso chega no seu e-mail em instantes.',
  pendente: 'Pagamento em processamento. Assim que for aprovado, enviamos o link para o seu e-mail.',
  falhou: 'O pagamento não foi concluído. Você pode tentar de novo pela página inicial.',
  'download-expirado': 'Aquele link de download expirou. Abra seu link pessoal do e-mail e clique em Baixar de novo.',
};

mostrarRetornoDoPagamento();
ligarFormularioDeRecuperacao();
abrirAreaDoCliente(lerCodigoDoEndereco());

function lerCodigoDoEndereco() {
  const parametros = new URLSearchParams(location.hash.slice(1));
  return parametros.get('codigo') || '';
}

function mostrarRetornoDoPagamento() {
  const parametros = new URLSearchParams(location.search);
  const mensagem = MENSAGENS_DE_RETORNO[parametros.get('pagamento')] || MENSAGENS_DE_RETORNO[`download-${parametros.get('download')}`];
  if (!mensagem) return;
  elementos.retorno.textContent = mensagem;
  elementos.retorno.hidden = false;
}

async function abrirAreaDoCliente(codigo) {
  if (!codigo) {
    elementos.recuperarAcesso.hidden = false;
    return;
  }

  elementos.carregando.hidden = false;
  try {
    const acesso = await chamarApi('acesso', { codigo });
    mostrarAreaDoCliente(codigo, acesso);
  } catch (erro) {
    elementos.motivoDaRecuperacao.textContent = `${erro.message} Digite o e-mail da compra para receber um novo link.`;
    elementos.recuperarAcesso.hidden = false;
  } finally {
    elementos.carregando.hidden = true;
  }
}

function mostrarAreaDoCliente(codigo, { nome, arquivos }) {
  elementos.nomeDoCliente.textContent = nome;
  elementos.listaDeArquivos.replaceChildren(...arquivos.map((arquivo) => criarItemDeDownload(codigo, arquivo)));
  elementos.areaDoCliente.hidden = false;
}

/** Um item da lista de downloads. Tudo com textContent: nada vira HTML. */
function criarItemDeDownload(codigo, arquivo) {
  const item = document.createElement('li');
  const titulo = document.createElement('strong');
  titulo.textContent = arquivo.titulo;
  const descricao = document.createElement('span');
  descricao.textContent = arquivo.descricao;

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao-comprar';
  botao.textContent = 'Baixar';
  botao.addEventListener('click', () => baixar(codigo, arquivo.id, botao));

  item.append(titulo, descricao, botao);
  return item;
}

async function baixar(codigo, arquivoId, botao) {
  botao.disabled = true;
  try {
    const { endereco } = await chamarApi('link-download', { codigo, arquivo: arquivoId });
    if (!ehEnderecoDoNossoArmazenamento(endereco)) throw new Error('Endereço de download inesperado.');
    location.assign(endereco);
  } catch (erro) {
    avisar(erro.message);
  } finally {
    botao.disabled = false;
  }
}

function ligarFormularioDeRecuperacao() {
  const formulario = elementos.formularioRecuperar;
  const resposta = formulario.querySelector('[data-resposta]');
  const botao = formulario.querySelector('[type="submit"]');

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;

    botao.disabled = true;
    try {
      const { mensagem } = await chamarApi('reenviar-acesso', { email: formulario.email.value });
      resposta.textContent = mensagem;
    } catch (erro) {
      resposta.textContent = erro.message;
    } finally {
      resposta.hidden = false;
      botao.disabled = false;
    }
  });
}

/** Links de download só podem apontar para a nossa própria rota /api/baixar. */
function ehEnderecoDoNossoArmazenamento(endereco) {
  try {
    const url = new URL(endereco, location.origin);
    return url.origin === location.origin && url.pathname === '/api/baixar';
  } catch {
    return false;
  }
}
