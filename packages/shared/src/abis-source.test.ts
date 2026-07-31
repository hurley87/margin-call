import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toEventSignature, toFunctionSignature } from "viem";
import { describe, expect, it } from "vitest";

import { packCustodyAbi, ripEngineAbi } from "./abis";

function sourceSignature(
  source: string,
  kind: "function" | "event",
  name: string
): string {
  const match = new RegExp(`\\b${kind}\\s+${name}\\s*\\(([^)]*)\\)`, "m").exec(
    source
  );
  if (!match && kind === "function") {
    const mapping = new RegExp(
      `mapping\\s*\\(\\s*([^\\s=]+)[^=]*=>[^)]*\\)\\s+public\\s+${name}\\s*;`,
      "m"
    ).exec(source);
    if (mapping) return `${name}(${mapping[1]})`;
  }
  if (!match) throw new Error(`${kind} ${name} is missing from Foundry source`);
  const types = match[1]!
    .split(",")
    .map((argument) => argument.trim())
    .filter(Boolean)
    .map((argument) => argument.split(/\s+/)[0]);
  return `${name}(${types.join(",")})`;
}

function abiFunctions(abi: readonly unknown[]) {
  return abi.filter(
    (item): item is Extract<(typeof abi)[number], { type: "function" }> =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "function"
  );
}

function abiEvents(abi: readonly unknown[]) {
  return abi.filter(
    (item): item is Extract<(typeof abi)[number], { type: "event" }> =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "event"
  );
}

describe("shared ABI parity with Foundry source", () => {
  it("matches every exported PackCustody lifecycle function and event", () => {
    const source = readFileSync(
      resolve(process.cwd(), "contracts/src/PackCustody.sol"),
      "utf8"
    );
    for (const item of abiFunctions(packCustodyAbi)) {
      expect(toFunctionSignature(item)).toBe(
        sourceSignature(source, "function", item.name)
      );
    }
    for (const item of abiEvents(packCustodyAbi)) {
      expect(toEventSignature(item)).toBe(
        sourceSignature(source, "event", item.name)
      );
    }
  });

  it("matches every exported RipEngine lifecycle function and event", () => {
    const source = readFileSync(
      resolve(process.cwd(), "contracts/src/RipEngine.sol"),
      "utf8"
    );
    for (const item of abiFunctions(ripEngineAbi)) {
      expect(toFunctionSignature(item)).toBe(
        sourceSignature(source, "function", item.name)
      );
    }
    for (const item of abiEvents(ripEngineAbi)) {
      expect(toEventSignature(item)).toBe(
        sourceSignature(source, "event", item.name)
      );
    }
  });
});
