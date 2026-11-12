/**
 * Decide se vale a pena ligar o estúdio 3D neste aparelho.
 *
 * Mostramos a versão em HTML quando:
 * - o navegador não tem WebGL (aparelhos antigos, alguns modos de economia)
 * - o visitante pediu menos movimento nas configurações do sistema
 * - o visitante escolheu a versão em lista (guardado no navegador)
 */

const CHAVE_PREFERENCIA = 'thesirvault:preferencia';

export function navegadorTemWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function visitantePrefereMenosMovimento() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Lê a escolha salva: '3d', 'lista' ou null se nunca escolheu. */
export function lerPreferencia() {
  try {
    return localStorage.getItem(CHAVE_PREFERENCIA);
  } catch {
    return null; // modo anônimo ou armazenamento bloqueado
  }
}

export function salvarPreferencia(valor) {
  try {
    localStorage.setItem(CHAVE_PREFERENCIA, valor);
  } catch {
    // sem problema: só não lembramos da escolha
  }
}

export function deveComecarEm3D() {
  if (!navegadorTemWebGL()) return false;
  const preferencia = lerPreferencia();
  if (preferencia) return preferencia === '3d';
  return !visitantePrefereMenosMovimento();
}
