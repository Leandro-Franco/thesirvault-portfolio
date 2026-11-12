-- =============================================================================
-- The Sir Vault · estrutura inicial do banco (Cloudflare D1, SQLite)
--
-- Aplicar:  npx wrangler d1 migrations apply thesirvault --remote
--
-- Regras de segurança:
--   1. O D1 não tem endereço público: só o nosso Worker acessa, pela ligação
--      (binding) BANCO. Não existe chave de banco para vazar.
--   2. O código do link pessoal NUNCA é guardado: só o hash SHA-256 dele.
--   3. IPs e e-mails nunca vão puros para a tabela de limites: só hashes.
--   4. Tabelas STRICT: o SQLite recusa valor de tipo errado em vez de converter.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pedidos: uma linha por tentativa de compra
-- Datas em texto ISO 8601 (UTC), por exemplo 2026-11-12T01:45:00.000Z
-- -----------------------------------------------------------------------------
CREATE TABLE pedidos (
  id                       TEXT PRIMARY KEY,
  nome                     TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 80),
  email                    TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  status                   TEXT NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente', 'aprovado', 'reembolsado')),
  valor_em_centavos        INTEGER NOT NULL CHECK (valor_em_centavos > 0),
  moeda                    TEXT NOT NULL DEFAULT 'BRL',
  mercadopago_pagamento_id TEXT UNIQUE,
  codigo_hash              TEXT UNIQUE
                             CHECK (codigo_hash IS NULL OR (length(codigo_hash) = 64 AND codigo_hash NOT GLOB '*[^0-9a-f]*')),
  criado_em                TEXT NOT NULL,
  atualizado_em            TEXT NOT NULL,
  aprovado_em              TEXT,
  email_enviado_em         TEXT,
  reembolsado_em           TEXT
) STRICT;

-- Busca de pedido aprovado por e-mail (botão "não recebi meu e-mail")
CREATE INDEX pedidos_email_status ON pedidos (email, status);

-- -----------------------------------------------------------------------------
-- Downloads: só registro, para enxergar abuso (não bloqueia ninguém)
-- -----------------------------------------------------------------------------
CREATE TABLE downloads (
  id         TEXT PRIMARY KEY,
  pedido_id  TEXT NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  arquivo    TEXT NOT NULL CHECK (arquivo IN ('presets', 'projects', 'drums')),
  baixado_em TEXT NOT NULL
) STRICT;

CREATE INDEX downloads_pedido ON downloads (pedido_id, baixado_em);

-- -----------------------------------------------------------------------------
-- Limites de uso: quantas tentativas cada chave fez em cada janela de tempo
-- (contra força bruta, robôs e bombardeio de e-mails)
-- -----------------------------------------------------------------------------
CREATE TABLE limites_de_uso (
  chave         TEXT NOT NULL,
  janela_inicio INTEGER NOT NULL, -- segundos desde 1970, arredondado para o início da janela
  contagem      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chave, janela_inicio)
) STRICT;
