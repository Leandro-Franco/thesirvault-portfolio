import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErroDeEntrada } from '../servidor/erros.js';
import {
  codigoTemFormatoValido,
  idDePagamentoValido,
  validarAceiteDosTermos,
  validarArquivo,
  validarEmail,
  validarNome,
} from '../servidor/validacao.js';
import { arquivosParaDownload } from '../servidor/entregaveis.js';

describe('nome', () => {
  it('aceita nomes com acento e normaliza espaços', () => {
    assert.equal(validarNome('  João   da Silva '), 'João da Silva');
    assert.equal(validarNome("D'Ávila"), "D'Ávila");
    assert.equal(validarNome('MC 2'), 'MC 2');
  });

  it('recusa HTML, scripts e símbolos (XSS e injeção)', () => {
    for (const nome of ['<script>alert(1)</script>', 'a', '"><img src=x>', 'nome; DROP TABLE', '{{7*7}}', '']) {
      assert.throws(() => validarNome(nome), ErroDeEntrada, nome);
    }
  });

  it('recusa o que não é texto', () => {
    for (const nome of [null, undefined, 123, {}, ['Ana']]) {
      assert.throws(() => validarNome(nome), ErroDeEntrada);
    }
  });
});

describe('e-mail', () => {
  it('aceita e devolve em minúsculas', () => {
    assert.equal(validarEmail(' Franco.TheSir+loja@Gmail.com '), 'franco.thesir+loja@gmail.com');
  });

  it('recusa formatos inválidos e tentativas de injeção de cabeçalho', () => {
    for (const email of ['a@b', 'sem-arroba.com', 'a b@c.com', 'a@b.com\r\nBcc: x@y.com', '<a>@b.com', `${'a'.repeat(250)}@b.com`]) {
      assert.throws(() => validarEmail(email), ErroDeEntrada, email);
    }
  });
});

describe('aceite dos termos', () => {
  it('só aceita true de verdade', () => {
    assert.equal(validarAceiteDosTermos(true), true);
    for (const valor of ['true', 'sim', 1, undefined, false]) {
      assert.throws(() => validarAceiteDosTermos(valor), ErroDeEntrada);
    }
  });
});

describe('arquivo do download', () => {
  it('aceita só os ids da lista', () => {
    assert.equal(validarArquivo('drums', arquivosParaDownload).id, 'drums');
  });

  it('recusa caminhos e travessia de pastas (path traversal)', () => {
    for (const arquivo of ['../segredos.zip', 'vol-01/mix-presets.zip', '/etc/passwd', 'drums/../../x', '', null]) {
      assert.throws(() => validarArquivo(arquivo, arquivosParaDownload), ErroDeEntrada);
    }
  });
});

describe('formatos de código e de pagamento', () => {
  it('código: só 43 caracteres base64url', () => {
    assert.equal(codigoTemFormatoValido('a'.repeat(43)), true);
    for (const codigo of ['a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, "' OR 1=1 --", null, 42]) {
      assert.equal(codigoTemFormatoValido(codigo), false);
    }
  });

  it('id de pagamento: só dígitos', () => {
    assert.equal(idDePagamentoValido('123456'), true);
    for (const id of ['abc', '12;DROP', '', '1'.repeat(31), null]) {
      assert.equal(idDePagamentoValido(id), false);
    }
  });
});
