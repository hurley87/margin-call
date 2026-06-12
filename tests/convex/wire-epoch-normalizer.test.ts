import { describe, it, expect } from "vitest";
import { trimIncompleteDispatchBody } from "../../convex/wire/epochNormalizer";

describe("trimIncompleteDispatchBody", () => {
  it("keeps bodies that already end on sentence punctuation", () => {
    const body =
      "Rourke turned up demanding books. The receptionist offered a box.";
    expect(trimIncompleteDispatchBody(body)).toBe(body);
  });

  it("trims a hard-cut tail back to the last sentence", () => {
    const body =
      "Allocators kept knocking since yesterday and this morning Rourke Capital turned up in person demanding to see Castle's books; the receptionist offered coffee and a cardboard box instead. Reggie Kessler is otherwise occupied, sources say, and the floor is repeating a rumor someone senior left with boxes last night. With PanAtlantic's $1400M hole still on everyone's tongue, lenders and allocators no";

    expect(trimIncompleteDispatchBody(body, 400)).toBe(
      "Allocators kept knocking since yesterday and this morning Rourke Capital turned up in person demanding to see Castle's books; the receptionist offered coffee and a cardboard box instead. Reggie Kessler is otherwise occupied, sources say, and the floor is repeating a rumor someone senior left with boxes last night."
    );
  });

  it("drops corrupted tail characters from legacy 180-char cuts", () => {
    const body =
      "Overnight murmurs hardened: a senior at Castle Securities was seen leaving with boxes and a counterparty stopped answering calls this morning. Allocators who wrote checks want the帳";

    expect(trimIncompleteDispatchBody(body, 180)).toBe(
      "Overnight murmurs hardened: a senior at Castle Securities was seen leaving with boxes and a counterparty stopped answering calls this morning."
    );
  });
});
