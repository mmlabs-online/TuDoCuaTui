// Test-only: adds connect() to a query-only pool fake. The client answers the transaction and set_config statements
// withUser sends itself and passes everything else to stub.query (T-019.4).
type Stub = { query: (...a: any[]) => Promise<any> };

const CONTROL = /^(begin|begin read only|commit|rollback)$/;
const EMPTY = { rows: [], rowCount: 0 };

export function fakePool<T extends Stub>(stub: T) {
  const released: unknown[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) =>
      CONTROL.test(sql) || sql.startsWith("select set_config(") ? EMPTY : stub.query(sql, params),
    release: (err?: unknown) => {
      released.push(err);
    },
  };
  return Object.assign({}, stub, { connect: async () => client, released });
}
