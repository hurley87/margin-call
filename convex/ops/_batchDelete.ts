import type { MutationCtx } from "../_generated/server";
import type { TableNames } from "../_generated/dataModel";

/**
 * Hard-delete every row in a table, draining it in batches so a single
 * mutation never loads the whole table into memory. Returns the count deleted.
 */
export async function deleteAllRows(
  ctx: MutationCtx,
  table: TableNames,
  batchSize = 500
): Promise<number> {
  let deleted = 0;
  while (true) {
    const rows = await ctx.db.query(table).take(batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      await ctx.db.delete(row._id);
      deleted++;
    }
  }
  return deleted;
}
