import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const PLUGIN_SPEC_PATH = path.join(
  process.cwd(),
  "packages/mcp-server/base-plugin/margin-call.md"
);

const markdownPromise = readFile(PLUGIN_SPEC_PATH, "utf8").catch(() => null);

export async function GET() {
  const markdown = await markdownPromise;
  if (markdown === null) {
    return NextResponse.json(
      {
        error:
          "Margin Call Base plugin spec is not available on this deployment",
      },
      { status: 404 }
    );
  }
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
