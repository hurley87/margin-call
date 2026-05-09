import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TraderAvatar } from "./trader-avatar";

describe("TraderAvatar", () => {
  it("renders a ready portrait image when a source exists", () => {
    const html = renderToStaticMarkup(
      <TraderAvatar
        name="Gordon Gekko"
        src="https://storage.example/gekko.png"
        imageStatus="ready"
      />
    );

    expect(html).toContain('data-status="ready"');
    expect(html).toContain('src="https://storage.example/gekko.png"');
    expect(html).toContain('alt="Gordon Gekko portrait"');
  });

  it("renders pending initials with loading copy", () => {
    const html = renderToStaticMarkup(
      <TraderAvatar name="Bud Fox" imageStatus="pending" />
    );

    expect(html).toContain('data-status="pending"');
    expect(html).toContain("BF");
    expect(html).toContain("Portrait developing");
    expect(html).not.toContain("<img");
  });

  it("renders generating initials with loading copy", () => {
    const html = renderToStaticMarkup(
      <TraderAvatar name="Kate Sullivan" imageStatus="generating" />
    );

    expect(html).toContain('data-status="generating"');
    expect(html).toContain("KS");
    expect(html).toContain("Generating portrait");
    expect(html).not.toContain("<img");
  });

  it("renders error fallback without raw error text", () => {
    const html = renderToStaticMarkup(
      <TraderAvatar name="Lou Mannheim" imageStatus="error" />
    );

    expect(html).toContain('data-status="error"');
    expect(html).toContain("LM");
    expect(html).toContain("Portrait unavailable");
    expect(html).not.toContain("timeout");
    expect(html).not.toContain("<img");
  });

  it("falls back when ready has no source", () => {
    const html = renderToStaticMarkup(
      <TraderAvatar name="Marvin Green" src={null} imageStatus="ready" />
    );

    expect(html).toContain('data-status="missing"');
    expect(html).toContain("MG");
    expect(html).not.toContain("<img");
  });
});
