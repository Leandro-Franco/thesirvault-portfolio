/**
 * O que o comprador recebe. Fica só no servidor: o navegador nunca vê os
 * caminhos dos arquivos no R2.
 *
 * Para trocar um arquivo: suba o novo .zip no bucket R2 "seu-bucket-r2"
 * com o mesmo caminho, ou mude o caminho aqui.
 */

export const arquivosParaDownload = [
  {
    id: 'presets',
    titulo: 'Mix Presets',
    descricao: 'Cadeias de mixagem para CLA-2A, CLA-3A, C6, API 550B, R-DeEsser e Pro-Q 4.',
    caminhoNoArmazenamento: 'vol-01/mix-presets.zip',
  },
  {
    id: 'projects',
    titulo: 'Project Files',
    descricao: 'Sessões de faixas lançadas, só para estudo.',
    caminhoNoArmazenamento: 'vol-01/project-files.zip',
  },
  {
    id: 'drums',
    titulo: 'Essential Drum Kit',
    descricao: 'Kicks, 808s, snares, claps, hi-hats, percussões e one-shots.',
    caminhoNoArmazenamento: 'vol-01/essential-drum-kit.zip',
  },
  {
    id: 'videoaulas',
    titulo: 'Videoaulas (bônus)',
    descricao: 'Considerações sobre o conteúdo e captação com celular, microfone condensador e microfone dinâmico.',
    caminhoNoArmazenamento: 'vol-01/videoaulas.zip',
  },
];

/** Por quanto tempo vale cada link de download gerado. */
export const VALIDADE_DO_LINK_DE_DOWNLOAD_EM_SEGUNDOS = 60 * 60; // 1 hora
