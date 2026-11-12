import * as THREE from 'three';
import { criarMateriais } from './materiais.js';
import { criarFormas } from './formas.js';
import { montarEstudio } from './estudio.js';
import { criarMonitor } from './monitor.js';
import { criarControleDeCamera } from './camera.js';

const COR_DO_AMBIENTE = '#15110d';

/**
 * Liga o estúdio 3D dentro da página.
 *
 * @param {object} opcoes
 * @param {HTMLElement} opcoes.container       onde o canvas 3D será colocado
 * @param {() => void} opcoes.aoComprar         tocaram em "Desbloquear" no monitor
 * @param {(modo: 'sala' | 'tela') => void} opcoes.aoMudarDeModo
 * @returns {{ voltarParaSala: () => void, pausar: () => void, retomar: () => void }}
 */
export function iniciarEstudio({ container, aoComprar, aoMudarDeModo }) {
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(COR_DO_AMBIENTE);
  cena.fog = new THREE.Fog(COR_DO_AMBIENTE, 13, 30);

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.08, 70);
  const renderizador = criarRenderizador();
  container.prepend(renderizador.domElement);

  const materiais = criarMateriais();
  const formas = criarFormas(cena);
  montarEstudio(cena, formas, materiais);
  const monitor = criarMonitor(cena, formas, materiais, { aoComprar });

  const controle = criarControleDeCamera({
    camera,
    elemento: renderizador.domElement,
    monitor,
    aoMudarDeModo,
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderizador.setSize(innerWidth, innerHeight);
  });

  const desenharQuadro = () => {
    controle.atualizar();
    renderizador.render(cena, camera);
  };
  renderizador.setAnimationLoop(desenharQuadro);

  return {
    voltarParaSala: controle.voltarParaSala,
    // Parar de desenhar quando o 3D está escondido economiza bateria.
    pausar: () => renderizador.setAnimationLoop(null),
    retomar: () => renderizador.setAnimationLoop(desenharQuadro),
  };
}

function criarRenderizador() {
  const renderizador = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderizador.setSize(innerWidth, innerHeight);
  renderizador.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = THREE.PCFShadowMap; // sombras suaves (o PCFSoft foi removido no three r18x)
  renderizador.outputColorSpace = THREE.SRGBColorSpace;
  renderizador.toneMapping = THREE.ACESFilmicToneMapping;
  renderizador.toneMappingExposure = 1.32;
  renderizador.domElement.setAttribute('aria-hidden', 'true');
  return renderizador;
}
