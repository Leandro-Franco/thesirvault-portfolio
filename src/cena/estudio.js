import * as THREE from 'three';

/**
 * Monta a sala do estúdio: luzes, paredes, mesa de som, caixas de som,
 * teclados, cabine de gravação e decoração.
 *
 * O monitor fica em outro arquivo (monitor.js) porque ele é interativo.
 * Aqui só tem objetos de cenário, que não reagem a cliques.
 */
export function montarEstudio(cena, formas, materiais) {
  montarLuzes(cena, formas);
  montarSala(formas, materiais);
  montarParedeDoFundo(formas, materiais);
  montarMesaDeSom(formas, materiais);
  montarCaixasDeSom(formas, materiais);
  montarSuporteDoMonitor(formas, materiais);
  montarTecladosEControles(formas, materiais);
  montarMesasLaterais(formas, materiais);
  montarCabineDeGravacao(formas, materiais);
  montarDecoracao(formas, materiais);
}

function montarLuzes(cena, { luzPontual }) {
  cena.add(new THREE.HemisphereLight('#f9d49a', '#271a12', 1.8));

  const luzPrincipal = new THREE.DirectionalLight('#ffe3a9', 2.5);
  luzPrincipal.position.set(-3, 7, 4);
  luzPrincipal.castShadow = true;
  luzPrincipal.shadow.mapSize.set(1024, 1024);
  cena.add(luzPrincipal);

  luzPontual(-3, 3, -3, '#ffc064', 2.5);
  luzPontual(3, 3, -2, '#ffbb55', 2.5);
}

/** Piso, paredes, ripas de madeira da parede esquerda e vigas do teto. */
function montarSala({ caixa }, m) {
  caixa(12, 0.2, 11, 0, -0.12, 0, m.madeiraEscura); // piso
  caixa(12, 5, 0.18, 0, 2.4, -5.2, m.madeira); // parede do fundo
  caixa(0.18, 5, 11, -6, 2.4, 0, m.madeiraEscura); // parede esquerda
  caixa(0.18, 5, 11, 6, 2.4, 0, m.madeiraEscura); // parede direita

  // Ripas verticais e difusores na parede esquerda
  for (let i = 0; i < 18; i++) {
    caixa(0.035, 4.65, 0.035, -5.88, 2.3, -4.9 + i * 0.54, m.madeiraClara);
    caixa(0.3, 3.5, 0.065, -5.72, 2.5, -4.9 + i * 0.55, m.madeiraClara);
  }

  // Ripas da parede do fundo, alternando tons
  for (let i = 0; i < 17; i++) {
    const material = i % 3 === 0 ? m.madeiraClara : m.madeiraEscura;
    caixa(0.18, 3.2, 0.08, -5.4 + i * 0.65, 2.45, -5.06, material);
  }

  // Vigas do teto
  for (let i = 0; i < 8; i++) {
    caixa(0.09, 0.1, 10, -5.4 + i * 1.55, 4.6, 0, m.madeiraClara);
  }
}

/** Janela da técnica, painéis de espuma e prateleiras. */
function montarParedeDoFundo({ caixa }, m) {
  caixa(4.6, 2.5, 0.13, 0, 2.75, -5.05, m.madeiraEscura); // moldura
  caixa(4.25, 2.15, 0.02, 0, 2.75, -4.96, m.vidro); // vidro
  caixa(4.5, 0.09, 0.15, 0, 4.04, -4.92, m.dourado); // friso de cima
  caixa(4.5, 0.09, 0.15, 0, 1.46, -4.92, m.dourado); // friso de baixo

  for (let i = 0; i < 5; i++) {
    caixa(0.55, 1.6, 0.12, -1.65 + i * 0.83, 2.8, -4.83, m.espuma);
  }
  caixa(1.1, 2.15, 0.1, 4.45, 2.7, -5.01, m.espuma);
  caixa(1.1, 2.15, 0.1, -4.45, 2.7, -5.01, m.espuma);

  for (let i = 0; i < 3; i++) {
    caixa(1.4, 0.22, 0.15, -3.7 + i * 3.7, 3.6, -4.82, m.madeiraClara);
  }
}

/** Bancada principal com a mesa de som (faders e knobs). */
function montarMesaDeSom({ caixa, cilindro }, m) {
  caixa(5.8, 0.22, 2.1, 0, 1.35, -1.5, m.madeiraClara); // tampo
  caixa(5.6, 0.18, 1.9, 0, 1.15, -1.5, m.madeiraEscura); // base do tampo

  for (const x of [-2.45, 2.45]) {
    caixa(0.16, 1.3, 0.16, x, 0.56, -2.25, m.metal); // pés de trás
    caixa(0.16, 1.3, 0.16, x, 0.56, -0.75, m.metal); // pés da frente
  }

  const mesa = caixa(4.9, 0.13, 1.15, 0, 1.46, -0.72, m.preto);
  mesa.rotation.x = -0.15;

  // Faders
  for (let i = 0; i < 13; i++) {
    caixa(0.055, 0.025, 0.22, -2.12 + i * 0.35, 1.56, -0.67, m.metal);
    caixa(0.09, 0.015, 0.06, -2.12 + i * 0.35, 1.57, -0.92, m.dourado);
  }

  // Knobs, 4 fileiras de 12
  for (let fileira = 0; fileira < 4; fileira++) {
    for (let i = 0; i < 12; i++) {
      const material = i % 3 === 0 ? m.dourado : m.metal;
      cilindro(0.032, 0.032, 0.025, -2.1 + i * 0.37, 1.54, -0.48 + fileira * 0.18, material, 10);
    }
  }
}

/** Par de monitores de referência, um de cada lado. */
function montarCaixasDeSom(formas, m) {
  montarCaixaDeSom(formas, m, -2.15);
  montarCaixaDeSom(formas, m, 2.15);
}

function montarCaixaDeSom({ caixa, cilindro, anel }, m, x) {
  caixa(0.85, 1.4, 0.65, x, 2.19, -2.48, m.preto); // gabinete
  caixa(0.73, 1.28, 0.03, x, 2.19, -2.13, m.madeiraEscura); // frente

  // Woofer (maior, embaixo) e tweeter (menor, em cima)
  for (const [y, raio] of [[1.91, 0.25], [2.57, 0.12]]) {
    const cone = cilindro(raio, raio, 0.045, x, y, -2.08, m.preto, 24);
    cone.rotation.x = Math.PI / 2;
    anel(raio * 0.82, 0.018, x, y, -2.045, m.dourado);
  }

  caixa(0.06, 0.05, 0.03, x - 0.25, 2.77, -2.08, m.dourado); // logo
}

/** Pé e base do monitor (a tela em si fica em monitor.js). */
function montarSuporteDoMonitor({ caixa }, m) {
  caixa(1.15, 0.08, 0.42, 0, 1.62, -1.94, m.metal);
  caixa(0.13, 0.46, 0.13, 0, 1.89, -1.94, m.metal);
}

/** Teclado MIDI, controlador de pads e mousepad. */
function montarTecladosEControles({ caixa, cilindro }, m) {
  caixa(1.75, 0.12, 0.48, 1.15, 1.58, 0.08, m.preto); // corpo do teclado

  for (let i = 0; i < 25; i++) {
    caixa(0.056, 0.025, 0.36, 0.33 + i * 0.067, 1.66, 0.08, m.creme); // tecla branca
    const temTeclaPreta = i % 7 !== 0 && i % 7 !== 3;
    if (temTeclaPreta) {
      caixa(0.034, 0.038, 0.19, 0.355 + i * 0.067, 1.685, -0.005, m.preto);
    }
  }

  caixa(0.75, 0.08, 0.44, -1.2, 1.56, 0.08, m.preto); // controlador de pads
  for (let fileira = 0; fileira < 3; fileira++) {
    for (let i = 0; i < 6; i++) {
      caixa(0.08, 0.018, 0.07, -1.46 + i * 0.105, 1.62, -0.05 + fileira * 0.11, m.metal);
    }
  }
  cilindro(0.08, 0.08, 0.02, -0.97, 1.64, 0.23, m.dourado);

  caixa(0.55, 0.035, 0.35, 0, 1.54, 0.05, m.madeiraEscura); // mousepad
  caixa(0.4, 0.028, 0.27, 0, 1.565, 0.05, m.preto);
}

/** Mesinhas laterais com pé de metal. */
function montarMesasLaterais({ caixa }, m) {
  for (const x of [-4.1, 4.1]) {
    caixa(0.8, 0.14, 0.65, x, 1.05, -2.2, m.madeiraClara);
    caixa(0.12, 1.2, 0.12, x, 0.45, -2.2, m.metal);
    caixa(0.6, 0.08, 0.5, x, 0.42, -2.2, m.preto);
  }
}

/** Cabine de voz com vidro, espuma e microfone com pop filter. */
function montarCabineDeGravacao({ caixa, cilindro, anel }, m) {
  caixa(2.4, 3.6, 0.14, 4.72, 2.0, -3.1, m.madeiraEscura);
  caixa(2.15, 3.2, 0.025, 4.7, 2.1, -3.02, m.vidro);
  caixa(0.12, 3.8, 0.16, 3.55, 2, -3.02, m.dourado);
  caixa(0.12, 3.8, 0.16, 5.84, 2, -3.02, m.dourado);

  for (let i = 0; i < 7; i++) {
    caixa(0.11, 2.8, 0.09, 3.8 + i * 0.28, 2.15, -4.75, m.espuma);
  }

  cilindro(0.035, 0.035, 2.2, 3.8, 1.2, -3.8, m.metal); // pedestal
  cilindro(0.16, 0.16, 0.34, 3.8, 2.45, -3.8, m.metal); // microfone
  anel(0.21, 0.024, 3.8, 2.48, -3.44, m.preto, 28); // pop filter
  caixa(0.18, 0.1, 0.15, 3.8, 2.5, -3.76, m.dourado);
}

/** Racks, luminárias do teto e abajur. */
function montarDecoracao({ caixa, cilindro, luzPontual }, m) {
  for (const x of [-3.7, 3.7]) {
    caixa(0.8, 1.3, 0.65, x, 0.65, 1.15, m.madeiraEscura);
    caixa(0.67, 0.05, 0.52, x, 1.33, 1.15, m.madeiraClara);
  }

  for (let i = 0; i < 7; i++) {
    caixa(0.65, 0.03, 0.12, -4.8 + i * 1.5, 4.33, -3.3, m.creme);
  }
  for (let i = 0; i < 6; i++) {
    caixa(0.1, 0.06, 0.1, -4.6 + i * 1.6, 4.27, -3.3, m.dourado);
  }

  cilindro(0.22, 0.28, 1.5, -4.7, 0.7, -1.5, m.metal); // pé do abajur
  cilindro(0.42, 0.22, 0.38, -4.7, 1.65, -1.5, m.dourado); // cúpula
  luzPontual(-4.7, 1.8, -1.5, '#ffb444', 1.2);
}
