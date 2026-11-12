import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { pacote, secoes, formatarPreco } from './src/conteudo/pacote.js';

/**
 * Configuração do Vite.
 *
 * 1. Várias páginas: vitrine, página do comprador e páginas legais.
 * 2. Um plugin pequeno que escreve o conteúdo do pacote dentro do HTML na hora
 *    do build. Assim a versão em HTML (e o Google) vê os mesmos textos do
 *    monitor 3D, vindos de src/conteudo/pacote.js.
 */
export default defineConfig({
  build: {
    // O three.js sozinho tem ~540 kB; ele só é baixado quando o 3D liga.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        vitrine: resolve(import.meta.dirname, 'index.html'),
        comprador: resolve(import.meta.dirname, 'comprador.html'),
        termos: resolve(import.meta.dirname, 'termos.html'),
        privacidade: resolve(import.meta.dirname, 'privacidade.html'),
      },
    },
  },
  plugins: [escreverConteudoDoPacote()],
});

function escreverConteudoDoPacote() {
  return {
    name: 'escrever-conteudo-do-pacote',
    transformIndexHtml(html) {
      return html
        .replaceAll('{{preco}}', escaparHtml(formatarPreco(pacote.precoEmCentavos)))
        .replace('<!-- conteudo-do-pacote -->', gerarHtmlDasSecoes());
    },
  };
}

function gerarHtmlDasSecoes() {
  const cartoes = secoes.map((secao) => {
    const itens = secao.itens.map((item) => `<li>${escaparHtml(item)}</li>`).join('');
    const observacao = secao.observacao ? `<p class="observacao">${escaparHtml(secao.observacao)}</p>` : '';
    return `
      <article class="secao" id="${escaparHtml(secao.id)}">
        <h2><span>${escaparHtml(secao.numero)}</span>${escaparHtml(secao.titulo)}</h2>
        <p class="subtitulo">${escaparHtml(secao.subtitulo)}</p>
        <ul>${itens}</ul>
        ${observacao}
      </article>`;
  });
  return `<section class="secoes" aria-label="Conteúdo do pacote">${cartoes.join('')}</section>`;
}

/** Evita que um texto do conteúdo vire HTML (proteção contra XSS no build). */
function escaparHtml(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
