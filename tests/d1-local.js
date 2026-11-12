import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/**
 * Um "D1 de mentira" em cima do SQLite que vem com o Node.
 * O D1 da Cloudflare também é SQLite, então rodamos a MESMA migração e o
 * MESMO SQL dos repositórios, e os testes pegam erro de SQL de verdade.
 *
 * Implementa só a parte da API do D1 que o projeto usa:
 * prepare().bind().first() / .all() / .run() e batch().
 */
export function criarD1Local() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  // Todas as migrações, na ordem do nome (0001, 0002, ...), como o wrangler faz.
  const pastaDasMigracoes = new URL('../banco/migracoes/', import.meta.url);
  for (const arquivo of readdirSync(pastaDasMigracoes).filter((nome) => nome.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(arquivo, pastaDasMigracoes), 'utf8'));
  }

  function prepare(sql) {
    let parametros = [];
    const instrucao = {
      bind(...valores) {
        if (valores.some((v) => v === undefined)) throw new Error('D1 não aceita undefined em bind()');
        parametros = valores;
        return instrucao;
      },
      async first() {
        return sqlite.prepare(sql).get(...parametros) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...parametros) };
      },
      async run() {
        const resultado = sqlite.prepare(sql).run(...parametros);
        return { meta: { changes: Number(resultado.changes) } };
      },
    };
    return instrucao;
  }

  async function batch(instrucoes) {
    sqlite.exec('BEGIN');
    try {
      const resultados = [];
      for (const instrucao of instrucoes) resultados.push(await instrucao.all());
      sqlite.exec('COMMIT');
      return resultados;
    } catch (erro) {
      sqlite.exec('ROLLBACK');
      throw erro;
    }
  }

  return { prepare, batch, sqlite };
}
