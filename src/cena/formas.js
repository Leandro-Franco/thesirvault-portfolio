import * as THREE from 'three';

/**
 * Ferramentas para montar o estúdio com poucas linhas.
 * Todas as medidas são em metros, e (x, y, z) é o centro do objeto.
 */
export function criarFormas(cena) {
  /** Uma caixa (parede, mesa, painel...). Devolve o objeto criado. */
  function caixa(largura, altura, profundidade, x, y, z, material, pai = cena) {
    const objeto = new THREE.Mesh(new THREE.BoxGeometry(largura, altura, profundidade), material);
    objeto.position.set(x, y, z);
    objeto.castShadow = true;
    objeto.receiveShadow = true;
    pai.add(objeto);
    return objeto;
  }

  /** Um cilindro (botões, pedestal, luminária...). */
  function cilindro(raioTopo, raioBase, altura, x, y, z, material, segmentos = 16, pai = cena) {
    const objeto = new THREE.Mesh(new THREE.CylinderGeometry(raioTopo, raioBase, altura, segmentos), material);
    objeto.position.set(x, y, z);
    objeto.castShadow = true;
    pai.add(objeto);
    return objeto;
  }

  /** Um anel (aro dos alto-falantes, pop filter). */
  function anel(raio, espessura, x, y, z, material, segmentos = 24) {
    const objeto = new THREE.Mesh(new THREE.TorusGeometry(raio, espessura, 8, segmentos), material);
    objeto.position.set(x, y, z);
    cena.add(objeto);
    return objeto;
  }

  /** Uma luz pontual quente, como uma lâmpada. */
  function luzPontual(x, y, z, cor, intensidade = 3) {
    const luz = new THREE.PointLight(cor, intensidade, 7);
    luz.position.set(x, y, z);
    cena.add(luz);
    return luz;
  }

  return { caixa, cilindro, anel, luzPontual };
}
