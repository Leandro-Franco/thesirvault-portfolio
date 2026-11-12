-- =============================================================================
-- 0002: as videoaulas viram um 4º arquivo para download (bônus)
--
-- O SQLite não deixa mudar um CHECK com ALTER TABLE, então a tabela de
-- downloads é recriada com a lista nova e os registros antigos são copiados.
-- =============================================================================

CREATE TABLE downloads_nova (
  id         TEXT PRIMARY KEY,
  pedido_id  TEXT NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  arquivo    TEXT NOT NULL CHECK (arquivo IN ('presets', 'projects', 'drums', 'videoaulas')),
  baixado_em TEXT NOT NULL
) STRICT;

INSERT INTO downloads_nova (id, pedido_id, arquivo, baixado_em)
  SELECT id, pedido_id, arquivo, baixado_em FROM downloads;

DROP TABLE downloads;
ALTER TABLE downloads_nova RENAME TO downloads;

CREATE INDEX downloads_pedido ON downloads (pedido_id, baixado_em);
