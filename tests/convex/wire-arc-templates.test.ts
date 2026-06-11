import { describe, it, expect } from "vitest";
import {
  spawnArc,
  ARC_TEMPLATES,
  templatePeakLossUsdc,
} from "../../convex/wire/arcTemplates";

describe("arcTemplates", () => {
  it("spawns a fully-specified arc with distinct firm + character slugs", () => {
    const spec = spawnArc("100", new Set());
    expect(spec.slug).toBeTruthy();
    expect(spec.firm.slug).toBeTruthy();
    expect(spec.character.slug).toBeTruthy();
    expect(spec.firm.slug).not.toBe(spec.character.slug);
    expect(spec.peakLossUsdc).toBeGreaterThan(0);
    expect(ARC_TEMPLATES.map((t) => t.key)).toContain(spec.templateKey);
  });

  it("is deterministic for the same seed", () => {
    const a = spawnArc("777", new Set());
    const b = spawnArc("777", new Set());
    expect(a.slug).toBe(b.slug);
    expect(a.firm.displayName).toBe(b.firm.displayName);
  });

  it("avoids slugs already taken", () => {
    const first = spawnArc("55", new Set());
    const taken = new Set([first.firm.slug, first.character.slug, first.slug]);
    const second = spawnArc("55", taken);
    expect(taken.has(second.firm.slug)).toBe(false);
    expect(taken.has(second.character.slug)).toBe(false);
  });

  it("offers at least six templates", () => {
    expect(ARC_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it("resolves a template peak loss and returns null for unknown keys", () => {
    expect(templatePeakLossUsdc(ARC_TEMPLATES[0].key)).toBeGreaterThan(0);
    expect(templatePeakLossUsdc("nope")).toBeNull();
    expect(templatePeakLossUsdc(null)).toBeNull();
  });
});
