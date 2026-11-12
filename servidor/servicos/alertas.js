import { ErroDeLimite } from '../erros.js';
import { registrar } from '../registro.js';

/**
 * Avisa o dono da loja por e-mail quando algo dá errado: todo evento de nível
 * "erro" ou "alerta" do log (servidor/registro.js).
 *
 * - No máximo 1 e-mail por tipo de evento a cada hora, para um ataque ou uma
 *   falha repetida não lotar a caixa de entrada. As repetições ficam nos logs.
 * - O e-mail leva só o que já vai para o log: nada de código de acesso, chave
 *   ou e-mail completo de cliente.
 *
 * @typedef {object} ServicoDeAlertas
 * @property {(registros: object[]) => Promise<void>} enviar
 */

const UMA_HORA_EM_SEGUNDOS = 60 * 60;

/** O que cada evento quer dizer e o que fazer, em linguagem de dono de loja. */
const EXPLICACOES = {
  'falha-inesperada':
    'Uma parte da loja deu erro para um visitante (código, banco ou serviço fora do ar). Se foi no aviso de pagamento, o Mercado Pago tenta de novo sozinho.',
  'arquivo-ausente-no-r2':
    'Um comprador tentou baixar um arquivo que não está no R2. Confira o upload com: rclone ls r2:seu-bucket-r2',
  'valor-divergente':
    'Chegou um pagamento com valor diferente do preço. O pedido ficou sem acesso. Confira o pagamento no Mercado Pago.',
  'pagamento-duplicado': 'O mesmo pedido foi pago duas vezes. Reembolse o segundo pagamento no Mercado Pago.',
  'pagamento-sem-pedido':
    'O Mercado Pago avisou de um pagamento que não é de nenhum pedido da loja. Confira no painel do Mercado Pago.',
  'webhook-assinatura-invalida':
    'Chegou um aviso de pagamento com assinatura errada. Pode ser alguém tentando enganar a loja, ou a assinatura secreta do webhook foi trocada no Mercado Pago. Se as compras pararem de liberar acesso, cadastre de novo o MERCADOPAGO_SEGREDO_DO_WEBHOOK.',
  'servicos-desligados':
    'O Mercado Pago ou o e-mail está sem segredo cadastrado, e as vendas ficam fechadas. Confira com: npx wrangler secret list',
};

/** @returns {ServicoDeAlertas} */
export function criarServicoDeAlertas({ email, limitador, para }) {
  /** Já avisou deste evento na última hora? Se o próprio banco falhar, avisa mesmo assim. */
  async function podeAvisar(evento) {
    try {
      await limitador.exigir(`alerta:${evento}`, 1, UMA_HORA_EM_SEGUNDOS);
      return true;
    } catch (erro) {
      return !(erro instanceof ErroDeLimite);
    }
  }

  return {
    async enviar(registros) {
      for (const registro of registros) {
        if (!(await podeAvisar(registro.evento))) continue;
        try {
          await email.enviarMensagem({ para, ...montarAlerta(registro) });
        } catch (erro) {
          // Sem alertar de novo: uma falha no envio do alerta viraria outro alerta.
          registrar('erro', 'alerta-nao-enviado', { eventoDoAlerta: registro.evento, mensagem: erro?.message }, { alertar: false });
        }
      }
    },
  };
}

/** @returns {{ assunto: string, texto: string }} */
export function montarAlerta({ nivel, evento, momento, ...detalhes }) {
  return {
    assunto: `[The Sir Vault] ${nivel}: ${evento}`,
    texto: [
      `Evento: ${evento} (${nivel})`,
      `Quando: ${momento} (horário UTC)`,
      '',
      EXPLICACOES[evento] ?? 'Evento sem explicação cadastrada. Veja os detalhes abaixo e os logs.',
      '',
      'Detalhes:',
      JSON.stringify(detalhes, null, 2),
      '',
      'Logs completos: Cloudflare → Workers & Pages → thesirvault → Observability.',
      'Se o mesmo evento se repetir dentro de 1 hora, não chega outro e-mail: veja os logs.',
    ].join('\n'),
  };
}
