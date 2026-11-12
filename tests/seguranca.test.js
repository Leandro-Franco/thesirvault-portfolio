import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  FORMATO_DO_CODIGO,
  assinaturaDoMercadoPagoValida,
  gerarCodigoDeAcesso,
  hashDoCodigo,
  hashDoIp,
  textosIguais,
} from '../servidor/seguranca.js';

describe('código de acesso', () => {
  it('tem 43 caracteres base64url (256 bits)', () => {
    const codigo = gerarCodigoDeAcesso();
    assert.match(codigo, FORMATO_DO_CODIGO);
  });

  it('nunca se repete em 10 mil gerações', () => {
    const codigos = new Set(Array.from({ length: 10_000 }, gerarCodigoDeAcesso));
    assert.equal(codigos.size, 10_000);
  });

  it('o hash é SHA-256 em hexadecimal e não contém o código', () => {
    const codigo = gerarCodigoDeAcesso();
    const hash = hashDoCodigo(codigo);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes(codigo));
  });
});

describe('hash de IP', () => {
  it('muda quando o segredo muda (não dá para reverter com tabela pronta)', () => {
    assert.notEqual(hashDoIp('200.1.2.3', 'segredo-a'), hashDoIp('200.1.2.3', 'segredo-b'));
  });
});

describe('textosIguais', () => {
  it('compara corretamente, inclusive tamanhos diferentes', () => {
    assert.equal(textosIguais('abc', 'abc'), true);
    assert.equal(textosIguais('abc', 'abd'), false);
    assert.equal(textosIguais('abc', 'abcd'), false);
  });
});

describe('assinatura do webhook do Mercado Pago', () => {
  const segredo = 'segredo-do-webhook';
  const idDaRequisicao = 'req-123';
  const idDoRecurso = '987654321';
  const momento = '1794444000';
  const assinar = (id, req, ts, chave = segredo) =>
    createHmac('sha256', chave).update(`id:${id};request-id:${req};ts:${ts};`).digest('hex');

  it('aceita uma assinatura correta', () => {
    const cabecalhoAssinatura = `ts=${momento},v1=${assinar(idDoRecurso, idDaRequisicao, momento)}`;
    assert.equal(assinaturaDoMercadoPagoValida({ cabecalhoAssinatura, idDaRequisicao, idDoRecurso, segredo }), true);
  });

  it('recusa assinatura feita com outra chave', () => {
    const cabecalhoAssinatura = `ts=${momento},v1=${assinar(idDoRecurso, idDaRequisicao, momento, 'chave-do-atacante')}`;
    assert.equal(assinaturaDoMercadoPagoValida({ cabecalhoAssinatura, idDaRequisicao, idDoRecurso, segredo }), false);
  });

  it('recusa quando trocam o id do pagamento (assinatura de outro pagamento)', () => {
    const cabecalhoAssinatura = `ts=${momento},v1=${assinar('111', idDaRequisicao, momento)}`;
    assert.equal(assinaturaDoMercadoPagoValida({ cabecalhoAssinatura, idDaRequisicao, idDoRecurso, segredo }), false);
  });

  it('recusa cabeçalho ausente, vazio ou malformado', () => {
    for (const cabecalhoAssinatura of [null, '', 'lixo', 'ts=1', 'v1=abc', 'ts=,v1=']) {
      assert.equal(assinaturaDoMercadoPagoValida({ cabecalhoAssinatura, idDaRequisicao, idDoRecurso, segredo }), false);
    }
  });

  it('recusa quando falta o x-request-id', () => {
    const cabecalhoAssinatura = `ts=${momento},v1=${assinar(idDoRecurso, idDaRequisicao, momento)}`;
    assert.equal(
      assinaturaDoMercadoPagoValida({ cabecalhoAssinatura, idDaRequisicao: null, idDoRecurso, segredo }),
      false,
    );
  });
});
