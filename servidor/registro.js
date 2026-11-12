/**
 * Logs estruturados (uma linha JSON por evento), lidos no painel da Cloudflare
 * (Workers → thesirvault → Observability → Logs).
 *
 * Regras:
 * - Nunca registrar código de acesso, tokens, chaves ou links assinados.
 * - E-mail sempre mascarado: "fr***@gmail.com".
 *
 * Alertas: eventos de nível "erro" ou "alerta" também entram numa fila curta.
 * No fim de cada requisição o Worker esvazia a fila e manda os alertas por
 * e-mail para o dono da loja (servidor/servicos/alertas.js). Sem isso, um erro
 * só ficaria no painel, que guarda os logs por poucos dias.
 */

const NIVEIS_QUE_ALERTAM = new Set(['erro', 'alerta']);
const TAMANHO_MAXIMO_DA_FILA = 20; // uma rajada de erros não enche a memória
const filaDeAlertas = [];

/**
 * @param {'info' | 'alerta' | 'erro'} nivel
 * @param {string} evento nome curto e fixo, ex.: "pedido-aprovado"
 * @param {object} [dados] detalhes que podem ir para o log (nada secreto)
 * @param {{ alertar?: boolean }} [opcoes] alertar: false registra sem mandar e-mail
 */
export function registrar(nivel, evento, dados = {}, { alertar = true } = {}) {
  const registro = { nivel, evento, momento: new Date().toISOString(), ...dados };
  const linha = JSON.stringify(registro);
  if (nivel === 'erro') console.error(linha);
  else if (nivel === 'alerta') console.warn(linha);
  else console.log(linha);

  if (alertar && NIVEIS_QUE_ALERTAM.has(nivel) && filaDeAlertas.length < TAMANHO_MAXIMO_DA_FILA) {
    filaDeAlertas.push(registro);
  }
}

/** Devolve os alertas guardados e esvazia a fila. */
export function retirarAlertas() {
  return filaDeAlertas.splice(0);
}

export function mascararEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '***';
  const [usuario, dominio] = email.split('@');
  return `${usuario.slice(0, 2)}***@${dominio}`;
}
