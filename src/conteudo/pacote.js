/**
 * Conteúdo do pacote The Sir Vault — Vol. 01.
 *
 * Este é o ÚNICO lugar onde ficam os textos, itens e preço do pacote.
 * Ele é usado por três partes do projeto:
 *   1. A tela do monitor no estúdio 3D (src/cena/monitor.js)
 *   2. A versão em HTML da vitrine, gerada no build (vite.config.js)
 *   3. O backend, que cobra o preço daqui (servidor/casos-de-uso/criar-pedido.js)
 *
 * Para mudar um texto ou o preço, mude aqui e pronto.
 */

export const pacote = {
  nome: 'The Sir Vault',
  volume: 'Vol. 01',
  artista: 'Franco The Sir',
  chamada: ['O SOM POR TRÁS', 'DO SOM.'],
  descricao: 'Explore o conteúdo do pack antes de comprar.',

  /** Preço em centavos, para nunca ter erro de arredondamento. 4990 = R$ 49,90. */
  precoEmCentavos: 4990,
  moeda: 'BRL',
};

/**
 * As quatro partes do pacote, na ordem em que aparecem no monitor.
 * `id` é usado nos cliques do monitor e nas âncoras da versão em HTML.
 */
export const secoes = [
  {
    id: 'presets',
    numero: '01',
    titulo: 'MIX PRESETS',
    subtitulo: 'Plugins e cadeias de mixagem do Franco The Sir',
    itens: ['CLA-2A', 'CLA-3A', 'C6', 'API 550B', 'R-DeEsser', 'FabFilter Pro-Q 4'],
    observacao: 'Presets para plugins de terceiros; plugins não incluídos.',
  },
  {
    id: 'projects',
    numero: '02',
    titulo: 'PROJECT FILES',
    subtitulo: 'Sessões de músicas lançadas para estudar',
    itens: [
      'Culpa do Fuso — Will e Teto (parte Franco Beach)',
      'Bad and Boujee',
      'Mais Você Que Eu Amo',
      'Desabou',
    ],
    observacao: 'Arquivos de projeto: compatibilidade e plugins serão informados.',
  },
  {
    id: 'drums',
    numero: '03',
    titulo: 'ESSENTIAL DRUM KIT',
    subtitulo: 'A seleção de bateria que uso nas produções',
    itens: ['Kicks e 808s', 'Snares e claps', 'Hi-hats e percussões', 'One-shots e elementos essenciais'],
    observacao: '',
  },
  {
    id: 'study',
    numero: '04',
    titulo: 'BÔNUS: VIDEOAULAS',
    subtitulo: 'Quatro aulas de captação, para baixar',
    itens: [
      'Considerações sobre o conteúdo',
      'Captação com celular',
      'Captação com microfone condensador',
      'Captação com microfone dinâmico',
    ],
    observacao: 'Bônus: os vídeos vêm em um arquivo para download, junto com o pacote.',
  },
];

/** Formata centavos como dinheiro brasileiro: 4990 → "R$ 49,90". */
export function formatarPreco(centavos) {
  const reais = (centavos / 100).toFixed(2).replace('.', ',');
  return `R$ ${reais}`;
}
