import { criarAvisos } from './interface/avisos.js';
import { criarJanelaDeCompra } from './interface/compra.js';
import { deveComecarEm3D, navegadorTemWebGL, salvarPreferencia } from './interface/suporte-3d.js';

/**
 * Ponto de entrada da vitrine (index.html).
 *
 * A página sempre tem a versão em HTML (gerada no build a partir de
 * src/conteudo/pacote.js). Se o aparelho aguenta, ligamos o estúdio 3D por cima.
 * O código do 3D só é baixado quando precisa (import dinâmico), então quem
 * fica na versão em HTML não paga o peso do three.js.
 */

const corpo = document.body;
const elementos = {
  hud: document.getElementById('hud'),
  dica: document.getElementById('dica'),
  aviso: document.getElementById('aviso'),
  botaoVoltar: document.getElementById('botao-voltar'),
  botaoVerEmLista: document.getElementById('botao-ver-em-lista'),
  botaoEntrarNoEstudio: document.getElementById('botao-entrar-no-estudio'),
  dialogoDeCompra: document.getElementById('dialogo-compra'),
};

const DICAS = {
  sala: 'Arraste para olhar ao redor · Toque no monitor para explorar',
  tela: 'Toque nas pastas · Arraste para ver as bordas · Use dois dedos para ajustar o zoom',
};

const avisar = criarAvisos(elementos.aviso);
const janelaDeCompra = criarJanelaDeCompra(elementos.dialogoDeCompra);
let estudio = null;

// Todo botão com data-comprar abre a janela de compra (no HUD e na versão em HTML).
document.querySelectorAll('[data-comprar]').forEach((botao) => {
  botao.addEventListener('click', () => janelaDeCompra.abrir());
});

elementos.botaoVerEmLista.addEventListener('click', () => {
  salvarPreferencia('lista');
  mostrarVersaoEmHtml();
});

elementos.botaoEntrarNoEstudio.addEventListener('click', () => {
  salvarPreferencia('3d');
  ligarEstudio3D();
});

elementos.botaoVoltar.addEventListener('click', () => estudio?.voltarParaSala());

// O botão "entrar no estúdio" só aparece se o aparelho tem 3D.
elementos.botaoEntrarNoEstudio.hidden = !navegadorTemWebGL();

if (deveComecarEm3D()) {
  ligarEstudio3D();
}

async function ligarEstudio3D() {
  corpo.classList.add('modo-3d');
  elementos.hud.hidden = false;

  if (estudio) {
    estudio.retomar();
    return;
  }

  try {
    const { iniciarEstudio } = await import('./cena/iniciar-estudio.js');
    estudio = iniciarEstudio({
      container: corpo,
      aoComprar: () => janelaDeCompra.abrir(),
      aoMudarDeModo: atualizarHud,
    });
    atualizarHud('sala');
  } catch (erro) {
    console.error('Falha ao iniciar o 3D', erro);
    mostrarVersaoEmHtml();
    avisar('Não foi possível carregar o estúdio 3D. Mostrando a versão simples.');
  }
}

function mostrarVersaoEmHtml() {
  corpo.classList.remove('modo-3d');
  elementos.hud.hidden = true;
  estudio?.pausar();
  scrollTo(0, 0);
}

function atualizarHud(modo) {
  elementos.dica.textContent = DICAS[modo];
  elementos.botaoVoltar.hidden = modo !== 'tela';
}
