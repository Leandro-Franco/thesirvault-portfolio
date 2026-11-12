import * as THREE from 'three';

/**
 * Paleta de materiais do estúdio.
 * Cada material é criado uma vez e reaproveitado por todos os objetos.
 */

/** Atalho para um material padrão: cor, quanto é metálico e quanto é áspero. */
function material(cor, metalico = 0, aspereza = 0.7) {
  return new THREE.MeshStandardMaterial({ color: cor, metalness: metalico, roughness: aspereza });
}

export function criarMateriais() {
  return {
    madeira: material('#81512d'),
    madeiraClara: material('#b17a43'),
    madeiraEscura: material('#442b1c'),
    preto: material('#151515', 0.25),
    metal: material('#454749', 0.7, 0.3),
    dourado: material('#d7a445', 0.35),
    creme: material('#ddd0b3'),
    espuma: material('#292624'),
    vidro: new THREE.MeshStandardMaterial({
      color: '#63888b',
      transparent: true,
      opacity: 0.25,
      metalness: 0.4,
      roughness: 0.12,
      side: THREE.DoubleSide,
    }),
  };
}
