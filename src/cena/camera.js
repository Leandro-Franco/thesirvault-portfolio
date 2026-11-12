import * as THREE from 'three';

/**
 * Controla para onde a câmera olha e como o visitante interage:
 *
 * - Modo "sala": arrastar gira a cabeça pela sala; a roda do mouse aproxima.
 *   Tocar no monitor entra no modo "tela".
 * - Modo "tela": a câmera enquadra o monitor. Arrastar orbita em volta dele,
 *   pinça com dois dedos ajusta o zoom e tocar na tela aciona os botões dela.
 *
 * A câmera nunca "pula": a cada quadro ela anda um pouco em direção ao alvo
 * (lerp), o que dá o movimento suave.
 */

const POSICAO_INICIAL = new THREE.Vector3(0, 3.1, 6.3);
const CENTRO_DO_MONITOR = new THREE.Vector3(0, 2.57, -1.7);
const DISTANCIA_PARA_SER_ARRASTO = 8; // pixels

/** Mantém um número entre um mínimo e um máximo. */
const limitar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

/**
 * @param {object} opcoes
 * @param {THREE.PerspectiveCamera} opcoes.camera
 * @param {HTMLCanvasElement} opcoes.elemento   canvas do renderer
 * @param {{ objetosClicaveis: THREE.Object3D[], tela: THREE.Object3D, tocar: (uv: THREE.Vector2) => void }} opcoes.monitor
 * @param {(modo: 'sala' | 'tela') => void} opcoes.aoMudarDeModo
 */
export function criarControleDeCamera({ camera, elemento, monitor, aoMudarDeModo }) {
  const estado = {
    modo: 'sala',
    // modo sala
    giroHorizontal: 0,
    giroVertical: 0.08,
    distanciaDaSala: POSICAO_INICIAL.z,
    // modo tela
    orbitaHorizontal: 0,
    orbitaVertical: 0,
    zoomDaTela: 1,
    // true enquanto um gesto de pinça acontece, para não virar clique
    houvePinca: false,
  };

  const alvoPosicao = new THREE.Vector3();
  const alvoOlhar = new THREE.Vector3();
  const olharAtual = new THREE.Vector3(0, 2, -1.7);

  camera.position.copy(POSICAO_INICIAL);

  function entrarNaTela() {
    estado.modo = 'tela';
    estado.zoomDaTela = 1;
    estado.orbitaHorizontal = 0;
    estado.orbitaVertical = 0;
    aoMudarDeModo('tela');
  }

  function voltarParaSala() {
    estado.modo = 'sala';
    aoMudarDeModo('sala');
  }

  ligarPonteiro({ elemento, camera, monitor, estado, entrarNaTela });
  ligarPinca(elemento, estado);
  ligarRodaDoMouse(elemento, estado);

  /** Chamado a cada quadro: calcula o alvo e move a câmera um pouco até ele. */
  function atualizar() {
    if (estado.modo === 'sala') {
      calcularAlvoNaSala(estado, alvoPosicao, alvoOlhar);
    } else {
      calcularAlvoNaTela(estado, camera, alvoPosicao, alvoOlhar);
    }
    camera.position.lerp(alvoPosicao, 0.075);
    olharAtual.lerp(alvoOlhar, 0.085);
    camera.lookAt(olharAtual);
  }

  return { atualizar, voltarParaSala };
}

function calcularAlvoNaSala(estado, alvoPosicao, alvoOlhar) {
  const { giroHorizontal, giroVertical, distanciaDaSala } = estado;
  alvoPosicao.set(Math.sin(giroHorizontal) * 2.2, 3.05 + giroVertical * 1.4, distanciaDaSala + Math.cos(giroHorizontal) * 0.4);
  alvoOlhar.set(Math.sin(giroHorizontal) * 1.6, 2.05 - giroVertical * 0.7, -1.7);
}

/**
 * Enquadra o monitor inteiro, em pé ou deitado: calcula a distância que faz
 * caber a altura e a largura da tela e usa a maior das duas.
 */
function calcularAlvoNaTela(estado, camera, alvoPosicao, alvoOlhar) {
  const campoDeVisao = (camera.fov * Math.PI) / 180;
  const distanciaPelaAltura = 1.55 / 2 / Math.tan(campoDeVisao / 2);
  const distanciaPelaLargura = 2.65 / 2 / Math.tan(campoDeVisao / 2) / camera.aspect;
  const ehCelular = innerWidth <= 700;
  const distancia = Math.max(distanciaPelaAltura, distanciaPelaLargura) * (ehCelular ? 0.77 : 1.16) * estado.zoomDaTela;

  alvoPosicao.set(
    Math.sin(estado.orbitaHorizontal) * distancia * 0.8,
    CENTRO_DO_MONITOR.y + Math.sin(estado.orbitaVertical) * distancia * 0.65,
    -1.67 + Math.cos(estado.orbitaHorizontal) * distancia,
  );
  alvoOlhar.copy(CENTRO_DO_MONITOR);
}

/** Arrastar para olhar/orbitar, e tocar (sem arrastar) para clicar. */
function ligarPonteiro({ elemento, camera, monitor, estado, entrarNaTela }) {
  let arrastando = false;
  let houveArrasto = false;
  let inicio = { x: 0, y: 0 };
  let ultimo = { x: 0, y: 0 };
  const raio = new THREE.Raycaster();
  const ponteiro = new THREE.Vector2();

  elemento.addEventListener('pointerdown', (evento) => {
    arrastando = true;
    houveArrasto = false;
    estado.houvePinca = false;
    inicio = { x: evento.clientX, y: evento.clientY };
    ultimo = { ...inicio };
    elemento.setPointerCapture(evento.pointerId);
  });

  elemento.addEventListener('pointermove', (evento) => {
    if (!arrastando) return;
    const dx = evento.clientX - ultimo.x;
    const dy = evento.clientY - ultimo.y;
    if (Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) > DISTANCIA_PARA_SER_ARRASTO) {
      houveArrasto = true;
    }

    if (estado.modo === 'sala') {
      estado.giroHorizontal = limitar(estado.giroHorizontal - dx * 0.004, -1.1, 1.1);
      estado.giroVertical = limitar(estado.giroVertical + dy * 0.003, -0.3, 0.55);
    } else {
      estado.orbitaHorizontal = limitar(estado.orbitaHorizontal - dx * 0.004, -0.95, 0.95);
      estado.orbitaVertical = limitar(estado.orbitaVertical + dy * 0.004, -0.7, 0.7);
    }
    ultimo = { x: evento.clientX, y: evento.clientY };
  });

  elemento.addEventListener('pointerup', (evento) => {
    arrastando = false;
    if (houveArrasto || estado.houvePinca) return;

    ponteiro.set((evento.clientX / innerWidth) * 2 - 1, -(evento.clientY / innerHeight) * 2 + 1);
    raio.setFromCamera(ponteiro, camera);
    const [primeiroToque] = raio.intersectObjects(monitor.objetosClicaveis);
    if (!primeiroToque) return;

    if (estado.modo === 'sala') {
      entrarNaTela();
    } else if (primeiroToque.object === monitor.tela && primeiroToque.uv) {
      monitor.tocar(primeiroToque.uv);
    }
  });
}

/** Pinça com dois dedos ajusta o zoom quando estamos olhando a tela. */
function ligarPinca(elemento, estado) {
  let distanciaAnterior = 0;
  const distanciaEntreDedos = (toques) =>
    Math.hypot(toques[0].clientX - toques[1].clientX, toques[0].clientY - toques[1].clientY);

  elemento.addEventListener(
    'touchstart',
    (evento) => {
      if (evento.touches.length === 2) distanciaAnterior = distanciaEntreDedos(evento.touches);
    },
    { passive: true },
  );

  elemento.addEventListener(
    'touchmove',
    (evento) => {
      if (estado.modo !== 'tela' || evento.touches.length !== 2) return;
      const distancia = distanciaEntreDedos(evento.touches);
      if (distanciaAnterior) {
        estado.zoomDaTela = limitar((estado.zoomDaTela * distanciaAnterior) / distancia, 0.56, 1.35);
      }
      distanciaAnterior = distancia;
      estado.houvePinca = true;
    },
    { passive: true },
  );

  elemento.addEventListener('touchend', () => (distanciaAnterior = 0), { passive: true });
}

/** Roda do mouse: aproxima na sala, gira de leve na tela. */
function ligarRodaDoMouse(elemento, estado) {
  elemento.addEventListener(
    'wheel',
    (evento) => {
      if (estado.modo === 'sala') {
        estado.distanciaDaSala = limitar(estado.distanciaDaSala + evento.deltaY * 0.003, 4.5, 8);
      } else {
        estado.orbitaHorizontal = limitar(estado.orbitaHorizontal + evento.deltaY * 0.0006, -0.75, 0.75);
      }
    },
    { passive: true },
  );
}
