/** Drizzle ships Durable Object migrations as `.sql` imports; the wrangler Text rule loads them. */
declare module '*.sql' {
  const sql: string
  export default sql
}
