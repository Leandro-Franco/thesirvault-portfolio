import { arquivosParaDownload } from '../entregaveis.js';
import { ErroDeAcesso } from '../erros.js';
import { hashDoCodigo } from '../seguranca.js';
import { codigoTemFormatoValido } from '../validacao.js';

/**
 * Busca o pedido aprovado a partir do código do link pessoal.
 * Usado por todos os casos de uso da página do comprador.
 *
 * Código com formato errado, inexistente, de pedido pendente ou reembolsado:
 * todos recebem o mesmo ErroDeAcesso, para não dar pistas a quem tenta adivinhar.
 */
export async function buscarPedidoPeloCodigo(pedidos, codigo) {
  if (!codigoTemFormatoValido(codigo)) throw new ErroDeAcesso();
  const pedido = await pedidos.buscarPorHashDoCodigo(hashDoCodigo(codigo));
  if (!pedido || pedido.status !== 'aprovado') throw new ErroDeAcesso();
  return pedido;
}

/**
 * Caso de uso: o cliente abriu a página do comprador com o link pessoal.
 * Devolve o nome e a lista de arquivos (sem os caminhos internos do R2).
 */
export function criarCasoConsultarAcesso({ pedidos, limitador }) {
  return async function consultarAcesso({ codigo, visitante }) {
    await limitador.exigir(`acesso:${visitante}`, 30, 10 * 60);
    const pedido = await buscarPedidoPeloCodigo(pedidos, codigo);

    return {
      nome: pedido.nome,
      arquivos: arquivosParaDownload.map(({ id, titulo, descricao }) => ({ id, titulo, descricao })),
    };
  };
}
