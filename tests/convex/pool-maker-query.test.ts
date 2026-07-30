/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const MAKER = "0x1234567890abcdef1234567890abcdef12345678";
const OTHER_MAKER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

type PackStatus = "resting" | "ripped" | "unlisted";

async function insertPack(
  t: ReturnType<typeof convexTest>,
  tokenId: number,
  maker: string,
  status: PackStatus
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("packs", {
      tokenId,
      maker,
      basket: [
        {
          asset: "0x0000000000000000000000000000000000000001",
          amount: "1000000000000000000",
          symbol: "TEST",
        },
      ],
      navUsdWad: `${tokenId}000000000000000000`,
      status,
      eligible: status === "resting",
      updatedAt: tokenId,
    });
  });
}

describe("pool.listPacksByMaker", () => {
  it("normalizes the wallet and paginates only that Maker's Packs", async () => {
    const t = convexTest(schema, modules);
    await insertPack(t, 1, MAKER, "resting");
    await insertPack(t, 2, MAKER, "ripped");
    await insertPack(t, 3, MAKER, "unlisted");
    await insertPack(t, 4, OTHER_MAKER, "resting");

    const firstPage = await t.query(api.pool.listPacksByMaker, {
      maker: `  0x${MAKER.slice(2).toUpperCase()}  `,
      paginationOpts: { cursor: null, numItems: 2 },
    });

    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.page.every((pack) => pack.maker === MAKER)).toBe(true);

    const secondPage = await t.query(api.pool.listPacksByMaker, {
      maker: MAKER,
      paginationOpts: {
        cursor: firstPage.continueCursor,
        numItems: 2,
      },
    });

    expect(secondPage.isDone).toBe(true);
    expect(
      [...firstPage.page, ...secondPage.page]
        .map((pack) => pack.tokenId)
        .sort((a, b) => a - b)
    ).toEqual([1, 2, 3]);
  });

  it("uses the composite index to filter by Maker and lifecycle status", async () => {
    const t = convexTest(schema, modules);
    await insertPack(t, 10, MAKER, "resting");
    await insertPack(t, 11, MAKER, "ripped");
    await insertPack(t, 12, OTHER_MAKER, "ripped");

    const result = await t.query(api.pool.listPacksByMaker, {
      maker: MAKER,
      status: "ripped",
      paginationOpts: { cursor: null, numItems: 20 },
    });

    expect(result.page.map((pack) => pack.tokenId)).toEqual([11]);
    expect(result.page[0]).toMatchObject({
      maker: MAKER,
      status: "ripped",
      eligible: false,
    });
  });

  it("rejects a malformed Maker address", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.pool.listPacksByMaker, {
        maker: "not-a-wallet",
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).rejects.toThrow("Invalid wallet address");
  });
});
