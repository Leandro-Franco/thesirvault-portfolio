import { ErroDeLimite } from '../erros.js';

/**
 * Limite de tentativas por janela de tempo, guardado no D1.
 *
 * Exemplo: exigir('acesso:<visitante>', 30, 600) deixa passar 30 tentativas a
 * cada 10 minutos. A janela é fixa (começa em múltiplos de 10 minutos), o que
 * é simples e suficiente contra força bruta e robôs.
 *
 * @typedef {object} Limitador
 * @property {(chave: string, maximo: number, janelaEmSegundos: number) => Promise<void>} exigir
 *   lança ErroDeLimite quando a chave passou do máximo na janela
 * @property {(idadeMaximaEmSegundos: number) => Promise<number>} apagarJanelasAntigas
 *   apaga contagens mais velhas que a idade dada e devolve quantas apagou
 */

/** @returns {Limitador} */
export function criarLimitador(banco, { agoraEmSegundos = () => Math.floor(Date.now() / 1000) } = {}) {
  return {
    async exigir(chave, maximo, janelaEmSegundos) {
      const inicioDaJanela = Math.floor(agoraEmSegundos() / janelaEmSegundos) * janelaEmSegundos;

      // As duas instruções rodam juntas (batch = transação):
      // 1. apaga janelas antigas desta chave, para a tabela não crescer sem fim
      // 2. soma 1 na janela atual e devolve a contagem
      const [, contar] = await banco.batch([
        banco.prepare('DELETE FROM limites_de_uso WHERE chave = ?1 AND janela_inicio < ?2').bind(chave, inicioDaJanela),
        banco
          .prepare(
            `INSERT INTO limites_de_uso (chave, janela_inicio, contagem) VALUES (?1, ?2, 1)
             ON CONFLICT (chave, janela_inicio) DO UPDATE SET contagem = contagem + 1
             RETURNING contagem`,
          )
          .bind(chave, inicioDaJanela),
      ]);

      const contagem = contar.results[0].contagem;
      if (contagem > maximo) throw new ErroDeLimite();
    },

    /**
     * O DELETE de cima só limpa a chave que voltou. Visitantes que nunca
     * voltam deixariam a linha para sempre, então a limpeza diária apaga tudo
     * o que for mais velho que a maior janela em uso.
     */
    async apagarJanelasAntigas(idadeMaximaEmSegundos) {
      const resultado = await banco
        .prepare('DELETE FROM limites_de_uso WHERE janela_inicio < ?1')
        .bind(agoraEmSegundos() - idadeMaximaEmSegundos)
        .run();
      return resultado.meta.changes;
    },
  };
}
