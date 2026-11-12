import { randomUUID } from 'node:crypto';
import { ErroDeLimite } from '../servidor/erros.js';

/**
 * Versões falsas (em memória) das dependências dos casos de uso.
 * Elas seguem os mesmos contratos das versões reais, então os casos de uso
 * não percebem a diferença (é o "L" e o "D" do SOLID na prática).
 */

export function criarPedidosFalso() {
  const linhas = new Map();
  const copia = (p) => (p ? { ...p } : null);

  return {
    linhas,
    async criar({ nome, email, valorEmCentavos }) {
      const pedido = {
        id: randomUUID(),
        nome,
        email,
        status: 'pendente',
        valorEmCentavos,
        emailEnviadoEm: null,
        codigoHash: null,
        idDoPagamento: null,
      };
      linhas.set(pedido.id, pedido);
      return copia(pedido);
    },
    async buscarPorId(id) {
      return copia(linhas.get(id));
    },
    async buscarPorHashDoCodigo(hash) {
      return copia([...linhas.values()].find((p) => p.codigoHash === hash));
    },
    async buscarAprovadoPorEmail(email) {
      return copia([...linhas.values()].find((p) => p.email === email && p.status === 'aprovado'));
    },
    async aprovar({ id, idDoPagamento, hashDoCodigo }) {
      const pedido = linhas.get(id);
      if (!pedido || pedido.status !== 'pendente') return false;
      Object.assign(pedido, { status: 'aprovado', idDoPagamento, codigoHash: hashDoCodigo });
      return true;
    },
    async trocarCodigo({ id, hashDoCodigo }) {
      linhas.get(id).codigoHash = hashDoCodigo;
    },
    async marcarEmailEnviado(id) {
      linhas.get(id).emailEnviadoEm = new Date().toISOString();
    },
    async marcarReembolsado(id) {
      Object.assign(linhas.get(id), { status: 'reembolsado', codigoHash: null });
    },
  };
}

export function criarPagamentosFalso() {
  const pagamentos = new Map();
  const checkouts = [];
  return {
    checkouts,
    /** Simula um pagamento existente no Mercado Pago. */
    definirPagamento(pagamento) {
      pagamentos.set(pagamento.id, pagamento);
    },
    async criarCheckout(dados) {
      checkouts.push(dados);
      return { enderecoDoCheckout: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${dados.pedido.id}` };
    },
    async buscarPagamento(id) {
      const pagamento = pagamentos.get(id);
      if (!pagamento) throw new Error('pagamento inexistente');
      return { ...pagamento };
    },
  };
}

export function criarEmailFalso() {
  const enviados = [];
  return {
    enviados,
    falharNaProxima: false,
    mensagens: [],
    async enviarLinkDeAcesso(dados) {
      if (this.falharNaProxima) {
        this.falharNaProxima = false;
        throw new Error('serviço de e-mail fora do ar');
      }
      enviados.push(dados);
    },
    async enviarMensagem(dados) {
      if (this.falharNaProxima) {
        this.falharNaProxima = false;
        throw new Error('serviço de e-mail fora do ar');
      }
      this.mensagens.push(dados);
    },
  };
}

/** Limitador falso: conta de verdade, mas em memória. */
export function criarLimitadorFalso() {
  const contagens = new Map();
  return {
    contagens,
    async exigir(chave, maximo) {
      const contagem = (contagens.get(chave) || 0) + 1;
      contagens.set(chave, contagem);
      if (contagem > maximo) throw new ErroDeLimite();
    },
  };
}

/** Links de download de verdade (com assinatura), com relógio controlável. */
export { criarServicoDeLinksDeDownload } from '../servidor/servicos/links-de-download.js';

/** R2 falso: guarda "arquivos" em memória e devolve no formato do R2. */
export function criarArquivosFalso(arquivosExistentes = {}) {
  const aberturas = [];
  return {
    aberturas,
    async abrir(caminho) {
      aberturas.push(caminho);
      if (!(caminho in arquivosExistentes)) return null;
      const texto = arquivosExistentes[caminho];
      return { body: new Blob([texto]).stream(), size: texto.length, httpEtag: '"etag"', range: undefined };
    },
  };
}

export function criarDownloadsFalso() {
  const registros = [];
  return {
    registros,
    async registrar(dados) {
      registros.push(dados);
    },
  };
}

/** Pega o código do link enviado por e-mail: .../comprador#codigo=XXXX */
export function codigoDoLink(link) {
  return new URL(link).hash.replace('#codigo=', '');
}
