import * as THREE from 'three';
import { pacote, secoes, formatarPreco } from '../conteudo/pacote.js';

/**
 * O monitor do estúdio é uma "tela de verdade": desenhamos a interface num
 * <canvas> 2D e usamos esse canvas como textura no 3D.
 *
 * Quando alguém toca na tela, recebemos a posição do toque (coordenada UV)
 * e descobrimos em qual área clicável ele caiu.
 */

const LARGURA = 1024;
const ALTURA = 640;

const CORES = {
  barraDoTopo: '#181712',
  dourado: '#e8b65b',
  textoClaro: '#f6e5c3',
  textoSuave: '#d1c1a3',
  textoApagado: '#bcb09b',
  cartao: '#30291f',
  item: '#2b271f',
  botaoVoltar: '#3b3226',
  botaoComprar: '#e1ae51',
  textoDoBotao: '#201609',
};

/**
 * Cria o monitor e devolve:
 * - `objetosClicaveis`: o que o raycaster deve testar (tela e carcaça)
 * - `tela`: a malha da tela, para sabermos se o toque foi nela
 * - `tocar(uv)`: trata um toque na tela
 *
 * @param {object} opcoes
 * @param {() => void} opcoes.aoComprar  chamado quando tocam em "Desbloquear"
 */
export function criarMonitor(cena, formas, materiais, { aoComprar }) {
  const carcaca = formas.caixa(2.48, 1.47, 0.12, 0, 2.57, -1.75, materiais.preto);

  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const contexto = canvas.getContext('2d');

  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;

  const tela = formas.caixa(2.32, 1.33, 0.015, 0, 2.57, -1.676, new THREE.MeshBasicMaterial({ map: textura }));

  const desenho = criarDesenhista(contexto);
  let paginaAtual = 'inicio';
  let areasClicaveis = [];

  function desenhar() {
    areasClicaveis = desenharPagina(desenho, paginaAtual);
    textura.needsUpdate = true;
  }

  /** Recebe a coordenada UV do toque (0 a 1) e executa a ação da área tocada. */
  function tocar(uv) {
    const x = uv.x * LARGURA;
    const y = (1 - uv.y) * ALTURA;
    const area = areasClicaveis.find((a) => x >= a.x && x <= a.x + a.largura && y >= a.y && y <= a.y + a.altura);
    if (!area) return;

    if (area.acao === 'comprar') {
      aoComprar();
    } else {
      paginaAtual = area.acao;
      desenhar();
    }
  }

  desenhar();
  return { objetosClicaveis: [tela, carcaca], tela, tocar };
}

/** Funções de desenho 2D simples, para o código das páginas ficar legível. */
function criarDesenhista(ctx) {
  return {
    fundo() {
      const gradiente = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
      gradiente.addColorStop(0, '#302216');
      gradiente.addColorStop(1, '#0c0c0b');
      ctx.fillStyle = gradiente;
      ctx.fillRect(0, 0, LARGURA, ALTURA);
    },
    retangulo(x, y, largura, altura, raio, cor) {
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.roundRect(x, y, largura, altura, raio);
      ctx.fill();
    },
    texto(conteudo, x, y, tamanho = 24, cor = CORES.textoClaro, peso = 'bold') {
      ctx.fillStyle = cor;
      ctx.font = `${peso} ${tamanho}px Arial`;
      ctx.fillText(conteudo, x, y);
    },
  };
}

/**
 * Desenha a página pedida e devolve a lista de áreas clicáveis dela.
 * Cada área é { x, y, largura, altura, acao }.
 */
function desenharPagina(desenho, pagina) {
  const areas = [];
  const areaClicavel = (x, y, largura, altura, acao) => areas.push({ x, y, largura, altura, acao });

  desenho.fundo();
  desenharCabecalho(desenho);

  if (pagina === 'inicio') {
    desenharInicio(desenho, areaClicavel);
  } else {
    const secao = secoes.find((s) => s.id === pagina);
    desenharSecao(desenho, areaClicavel, secao);
  }

  desenharBotaoComprar(desenho, areaClicavel);
  return areas;
}

function desenharCabecalho(desenho) {
  desenho.retangulo(0, 0, LARGURA, 90, 0, CORES.barraDoTopo);
  desenho.texto(`◈ ${pacote.nome.toUpperCase()}`, 40, 53, 28, CORES.dourado);
  desenho.texto(`${pacote.artista.toUpperCase()} / ${pacote.volume.toUpperCase()}`, 650, 50, 19, CORES.textoApagado, 'normal');
}

/** Página inicial: chamada grande + um cartão por seção, em grade 2x2. */
function desenharInicio(desenho, areaClicavel) {
  desenho.texto(pacote.chamada[0], 45, 169, 59);
  desenho.texto(pacote.chamada[1], 45, 231, 59);
  desenho.texto(pacote.descricao, 47, 273, 22, CORES.textoSuave, 'normal');

  secoes.forEach((secao, i) => {
    const x = 45 + (i % 2) * 470;
    const y = 305 + Math.floor(i / 2) * 105;
    desenho.retangulo(x, y, 446, 88, 12, CORES.cartao);
    desenho.texto(secao.numero, x + 18, y + 38, 21, '#e5b760');
    desenho.texto(`${secao.titulo}  ›`, x + 67, y + 51, 22);
    areaClicavel(x, y, 446, 88, secao.id);
  });
}

/** Página de uma seção: botão voltar, título e a lista de itens. */
function desenharSecao(desenho, areaClicavel, secao) {
  desenho.retangulo(42, 112, 138, 48, 9, CORES.botaoVoltar);
  desenho.texto('← VOLTAR', 58, 143, 20, '#f4ca7b');
  areaClicavel(42, 112, 138, 48, 'inicio');

  desenho.texto(secao.titulo, 44, 223, 48);
  desenho.texto(secao.subtitulo, 45, 260, 21, '#c9bca4', 'normal');

  // Até 4 itens: uma coluna larga. Mais que isso: duas colunas.
  const duasColunas = secao.itens.length > 4;

  secao.itens.forEach((item, i) => {
    const x = 45 + (duasColunas ? i % 2 : 0) * 470;
    const y = 285 + (duasColunas ? Math.floor(i / 2) : i) * 54;
    const largura = duasColunas ? 446 : 934;
    const altura = duasColunas ? 70 : 47;
    const linhaDoTexto = y + (duasColunas ? 43 : 31);
    const limiteDeLetras = duasColunas ? 30 : 72;
    const texto = item.length > limiteDeLetras ? `${item.slice(0, limiteDeLetras - 1)}…` : item;

    desenho.retangulo(x, y, largura, altura, 9, CORES.item);
    desenho.texto('▣', x + 15, linhaDoTexto, 20, '#e7b75b');
    desenho.texto(texto, x + 52, linhaDoTexto, duasColunas ? 19 : 21, '#f4e6cd', 'normal');
  });

  if (secao.observacao) {
    const y = duasColunas ? 506 : 529;
    desenho.texto(secao.observacao, 47, y, 17, '#c8bba5', 'normal');
  }
}

function desenharBotaoComprar(desenho, areaClicavel) {
  desenho.retangulo(45, 548, 934, 70, 12, CORES.botaoComprar);
  const texto = `DESBLOQUEAR ${pacote.nome.toUpperCase()} · ${formatarPreco(pacote.precoEmCentavos)}  →`;
  desenho.texto(texto, 91, 593, 27, CORES.textoDoBotao);
  areaClicavel(45, 548, 934, 70, 'comprar');
}
