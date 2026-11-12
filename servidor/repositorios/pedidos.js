/**
 * Acesso à tabela `pedidos` no Cloudflare D1. Só este arquivo conhece os
 * nomes das colunas; o resto do código usa objetos em português (camelCase).
 *
 * Toda consulta usa parâmetros (?1, ?2...) com .bind(), nunca texto colado
 * no SQL. É isso que impede injeção de SQL.
 *
 * @typedef {object} Pedido
 * @property {string} id
 * @property {string} nome
 * @property {string} email
 * @property {'pendente' | 'aprovado' | 'reembolsado'} status
 * @property {number} valorEmCentavos
 * @property {string | null} idDoPagamento
 * @property {string | null} emailEnviadoEm
 *
 * @typedef {object} RepositorioDePedidos
 * @property {(dados: { nome: string, email: string, valorEmCentavos: number }) => Promise<Pedido>} criar
 * @property {(id: string) => Promise<Pedido | null>} buscarPorId
 * @property {(hash: string) => Promise<Pedido | null>} buscarPorHashDoCodigo
 * @property {(email: string) => Promise<Pedido | null>} buscarAprovadoPorEmail
 * @property {(dados: { id: string, idDoPagamento: string, hashDoCodigo: string }) => Promise<boolean>} aprovar
 * @property {(dados: { id: string, hashDoCodigo: string }) => Promise<void>} trocarCodigo
 * @property {(id: string) => Promise<void>} marcarEmailEnviado
 * @property {(id: string) => Promise<void>} marcarReembolsado
 * @property {(dataIso: string) => Promise<number>} apagarPendentesCriadosAntesDe
 */

const COLUNAS = 'id, nome, email, status, valor_em_centavos, mercadopago_pagamento_id, email_enviado_em';

function paraPedido(linha) {
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    status: linha.status,
    valorEmCentavos: linha.valor_em_centavos,
    idDoPagamento: linha.mercadopago_pagamento_id,
    emailEnviadoEm: linha.email_enviado_em,
  };
}

/** @returns {RepositorioDePedidos} */
export function criarRepositorioDePedidos(banco, { agora = () => new Date().toISOString(), novoId = () => crypto.randomUUID() } = {}) {
  const consultar = (sql, ...parametros) => banco.prepare(sql).bind(...parametros);

  return {
    async criar({ nome, email, valorEmCentavos }) {
      const momento = agora();
      const linha = await consultar(
        `INSERT INTO pedidos (id, nome, email, valor_em_centavos, criado_em, atualizado_em)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         RETURNING ${COLUNAS}`,
        novoId(), nome, email, valorEmCentavos, momento,
      ).first();
      return paraPedido(linha);
    },

    async buscarPorId(id) {
      return paraPedido(await consultar(`SELECT ${COLUNAS} FROM pedidos WHERE id = ?1`, id).first());
    },

    async buscarPorHashDoCodigo(hash) {
      return paraPedido(await consultar(`SELECT ${COLUNAS} FROM pedidos WHERE codigo_hash = ?1`, hash).first());
    },

    async buscarAprovadoPorEmail(email) {
      const linha = await consultar(
        `SELECT ${COLUNAS} FROM pedidos
         WHERE email = ?1 AND status = 'aprovado'
         ORDER BY aprovado_em DESC LIMIT 1`,
        email,
      ).first();
      return paraPedido(linha);
    },

    /**
     * Aprova o pedido só se ele ainda estiver pendente.
     * Devolve true para quem aprovou e false se já estava aprovado, o que
     * garante um único e-mail mesmo com avisos repetidos do Mercado Pago.
     */
    async aprovar({ id, idDoPagamento, hashDoCodigo }) {
      const momento = agora();
      const resultado = await consultar(
        `UPDATE pedidos
         SET status = 'aprovado', mercadopago_pagamento_id = ?2, codigo_hash = ?3, aprovado_em = ?4, atualizado_em = ?4
         WHERE id = ?1 AND status = 'pendente'`,
        id, idDoPagamento, hashDoCodigo, momento,
      ).run();
      return resultado.meta.changes === 1;
    },

    async trocarCodigo({ id, hashDoCodigo }) {
      await consultar(
        'UPDATE pedidos SET codigo_hash = ?2, atualizado_em = ?3 WHERE id = ?1',
        id, hashDoCodigo, agora(),
      ).run();
    },

    async marcarEmailEnviado(id) {
      const momento = agora();
      await consultar('UPDATE pedidos SET email_enviado_em = ?2, atualizado_em = ?2 WHERE id = ?1', id, momento).run();
    },

    /** Reembolso ou estorno: apaga o código, e o link pessoal para de funcionar na hora. */
    async marcarReembolsado(id) {
      const momento = agora();
      await consultar(
        `UPDATE pedidos SET status = 'reembolsado', codigo_hash = NULL, reembolsado_em = ?2, atualizado_em = ?2
         WHERE id = ?1`,
        id, momento,
      ).run();
    },

    /**
     * Apaga compras que nunca foram pagas (nome e e-mail de quem desistiu).
     * Só pedidos pendentes: aprovados e reembolsados ficam como registro da venda.
     * Devolve quantos foram apagados.
     */
    async apagarPendentesCriadosAntesDe(dataIso) {
      const resultado = await consultar(
        "DELETE FROM pedidos WHERE status = 'pendente' AND criado_em < ?1",
        dataIso,
      ).run();
      return resultado.meta.changes;
    },
  };
}
