import { ErroDeEntrada } from './erros.js';
import { FORMATO_DO_CODIGO } from './seguranca.js';

/**
 * Validação de tudo que chega de fora. Regra de ouro: aceitar só o formato
 * esperado (lista do que pode), em vez de tentar barrar o que não pode.
 * Cada função devolve o valor já limpo, ou lança ErroDeEntrada.
 */

// Começa com letra; depois letras (com acento), números, espaço, apóstrofo, ponto e hífen.
const FORMATO_DO_NOME = /^[\p{L}][\p{L}\p{N} '.-]{1,79}$/u;

// Formato prático de e-mail: algo@algo.dominio, sem espaços nem caracteres de controle.
const PARTE_DO_EMAIL = '[^\\s@<>()[\\]\\\\,;:"\\x00-\\x1f\\x7f]+';
const FORMATO_DO_EMAIL = new RegExp(`^${PARTE_DO_EMAIL}@${PARTE_DO_EMAIL}\\.[A-Za-z]{2,}$`);

export function validarNome(nome) {
  const limpo = typeof nome === 'string' ? nome.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (!FORMATO_DO_NOME.test(limpo)) {
    throw new ErroDeEntrada('Digite seu nome (de 2 a 80 caracteres, sem símbolos).');
  }
  return limpo;
}

export function validarEmail(email) {
  const limpo = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (limpo.length > 254 || !FORMATO_DO_EMAIL.test(limpo)) {
    throw new ErroDeEntrada('Digite um e-mail válido.');
  }
  return limpo;
}

export function validarAceiteDosTermos(aceitou) {
  if (aceitou !== true) {
    throw new ErroDeEntrada('É preciso aceitar os termos e a licença de uso.');
  }
  return true;
}

/** Código do link pessoal. Formato errado recebe a mesma resposta de código inexistente. */
export function codigoTemFormatoValido(codigo) {
  return typeof codigo === 'string' && FORMATO_DO_CODIGO.test(codigo);
}

/** O arquivo pedido precisa estar na lista de arquivos do pacote. */
export function validarArquivo(arquivoId, arquivosPermitidos) {
  const arquivo = arquivosPermitidos.find((a) => a.id === arquivoId);
  if (!arquivo) throw new ErroDeEntrada('Arquivo não encontrado.');
  return arquivo;
}

/** ID de pagamento do Mercado Pago: só dígitos. */
export function idDePagamentoValido(id) {
  return typeof id === 'string' && /^\d{1,30}$/.test(id);
}
