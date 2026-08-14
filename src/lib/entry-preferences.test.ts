// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ENTRY_LEVERAGE_TIERS_BPS,
  ENTRY_MARGINS_TUSD,
} from "@/lib/margin-call-crash";
import {
  ENTRY_PREFS_STORAGE_KEY,
  getEntryPreferences,
  normalizeEntryPreferences,
  resetEntryPreferencesForTests,
  setEntryLeverage,
  setEntryMargin,
} from "./entry-preferences";

describe("normalizeEntryPreferences", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(normalizeEntryPreferences({})).toEqual({
      margin: ENTRY_MARGINS_TUSD[0],
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[0],
    });
    expect(
      normalizeEntryPreferences({ margin: "999", leverageBps: "nope" })
    ).toEqual({
      margin: ENTRY_MARGINS_TUSD[0],
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[0],
    });
  });

  it("accepts allowed margins and leverage tiers", () => {
    expect(
      normalizeEntryPreferences({
        margin: ENTRY_MARGINS_TUSD[2],
        leverageBps: ENTRY_LEVERAGE_TIERS_BPS[3],
      })
    ).toEqual({
      margin: ENTRY_MARGINS_TUSD[2],
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[3],
    });
    expect(
      normalizeEntryPreferences({
        margin: ENTRY_MARGINS_TUSD[1].toString(),
        leverageBps: ENTRY_LEVERAGE_TIERS_BPS[5].toString(),
      })
    ).toEqual({
      margin: ENTRY_MARGINS_TUSD[1],
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[5],
    });
  });
});

describe("entry preferences store", () => {
  beforeEach(() => {
    resetEntryPreferencesForTests();
  });

  afterEach(() => {
    resetEntryPreferencesForTests();
  });

  it("persists valid picks to localStorage", () => {
    setEntryMargin(ENTRY_MARGINS_TUSD[1]);
    setEntryLeverage(ENTRY_LEVERAGE_TIERS_BPS[2]);
    expect(getEntryPreferences()).toEqual({
      margin: ENTRY_MARGINS_TUSD[1],
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[2],
    });
    const raw = window.localStorage.getItem(ENTRY_PREFS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({
      margin: ENTRY_MARGINS_TUSD[1].toString(),
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[2].toString(),
    });
  });

  it("ignores disallowed picks", () => {
    setEntryMargin(7n * 1_000_000n);
    setEntryLeverage(99_000n);
    expect(getEntryPreferences()).toEqual({
      margin: ENTRY_MARGINS_TUSD[0],
      leverageBps: ENTRY_LEVERAGE_TIERS_BPS[0],
    });
  });
});
