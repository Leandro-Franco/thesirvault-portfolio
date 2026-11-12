/**
 * Mostra um aviso curto na parte de baixo da tela, que some sozinho.
 * Usa textContent (nunca innerHTML) para que nenhum texto vire código na página.
 */
export function criarAvisos(elemento) {
  let temporizador;

  return function avisar(mensagem, duracaoEmMs = 3500) {
    elemento.textContent = mensagem;
    elemento.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (elemento.hidden = true), duracaoEmMs);
  };
}
