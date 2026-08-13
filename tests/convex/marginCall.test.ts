/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const WALLET = "0x1234567890123456789012345678901234567890";
const DID = "did:privy:cm_user_voice_1";

function authed() {
  const t = convexTest(schema, modules);
  return t.withIdentity({
    subject: DID,
    issuer: "privy.io",
    tokenIdentifier: `privy.io|${DID}`,
  });
}

describe("marginCall consent + request", () => {
  it("defaults Desk phone switch to off when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.marginCall.myMarginCallConsent, {})
    ).resolves.toEqual({ optedIn: false });
  });

  it("rejects consent mutation without authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.marginCall.setMarginCallConsent, {
        optedIn: true,
        walletAddress: WALLET,
      })
    ).rejects.toThrow("Not authenticated");
  });

  it("persists opt-in and opt-out without storing a phone number", async () => {
    const t = authed();

    await t.mutation(api.marginCall.setMarginCallConsent, {
      optedIn: true,
      walletAddress: WALLET,
    });
    await expect(
      t.query(api.marginCall.myMarginCallConsent, {})
    ).resolves.toEqual({ optedIn: true });

    await t.mutation(api.marginCall.setMarginCallConsent, {
      optedIn: false,
      walletAddress: WALLET,
    });
    await expect(
      t.query(api.marginCall.myMarginCallConsent, {})
    ).resolves.toEqual({ optedIn: false });

    const rows = await t.run(async (ctx) => {
      return await ctx.db.query("marginCallConsent").collect();
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      privyDid: DID,
      walletAddress: WALLET.toLowerCase(),
      optedIn: false,
    });
    expect(JSON.stringify(rows[0])).not.toMatch(/\+1|phone/i);
  });

  it("no-ops requestMarginCall when the switch is off", async () => {
    const t = authed();
    const result = await t.mutation(api.marginCall.requestMarginCall, {
      ticketId: "42",
      roundId: "7",
      walletAddress: WALLET,
    });
    expect(result).toEqual({ scheduled: false, reason: "not_opted_in" });

    const attempts = await t.run(async (ctx) => {
      return await ctx.db.query("marginCallAttempts").collect();
    });
    expect(attempts).toHaveLength(0);
  });

  it("schedules once per ticket and no-ops the second request", async () => {
    const t = authed();
    await t.mutation(api.marginCall.setMarginCallConsent, {
      optedIn: true,
      walletAddress: WALLET,
    });

    const first = await t.mutation(api.marginCall.requestMarginCall, {
      ticketId: "99",
      roundId: "3",
      walletAddress: WALLET,
    });
    expect(first.scheduled).toBe(true);
    if (!first.scheduled) throw new Error("expected schedule");

    const second = await t.mutation(api.marginCall.requestMarginCall, {
      ticketId: "99",
      roundId: "3",
      walletAddress: WALLET,
    });
    expect(second).toEqual({ scheduled: false, reason: "already_attempted" });

    const attempts = await t.run(async (ctx) => {
      return await ctx.db.query("marginCallAttempts").collect();
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      ticketId: "99",
      roundId: "3",
      status: "pending",
      privyDid: DID,
    });
    expect(attempts[0]).not.toHaveProperty("phone");
    expect(JSON.stringify(attempts)).not.toMatch(/\+1555/);
  });

  it("marks an attempt skipped when consent is flipped off before placeCall", async () => {
    const t = authed();
    await t.mutation(api.marginCall.setMarginCallConsent, {
      optedIn: true,
      walletAddress: WALLET,
    });
    const scheduled = await t.mutation(api.marginCall.requestMarginCall, {
      ticketId: "11",
      roundId: "2",
      walletAddress: WALLET,
    });
    expect(scheduled.scheduled).toBe(true);
    if (!scheduled.scheduled) throw new Error("expected schedule");

    await t.mutation(api.marginCall.setMarginCallConsent, {
      optedIn: false,
      walletAddress: WALLET,
    });

    // Exercise the store helpers the action uses before Twilio.
    const consent = await t.query(internal.marginCallStore.getConsentByDid, {
      privyDid: DID,
    });
    expect(consent?.optedIn).toBe(false);

    await t.mutation(internal.marginCallStore.markAttempt, {
      attemptId: scheduled.attemptId,
      status: "skipped",
      reason: "not_opted_in",
    });

    const attempt = await t.query(internal.marginCallStore.getAttempt, {
      attemptId: scheduled.attemptId,
    });
    expect(attempt).toMatchObject({
      status: "skipped",
      reason: "not_opted_in",
    });
  });

  it("refuses to rewrite a terminal attempt status", async () => {
    const t = authed();
    await t.mutation(api.marginCall.setMarginCallConsent, {
      optedIn: true,
      walletAddress: WALLET,
    });
    const scheduled = await t.mutation(api.marginCall.requestMarginCall, {
      ticketId: "55",
      roundId: "4",
      walletAddress: WALLET,
    });
    expect(scheduled.scheduled).toBe(true);
    if (!scheduled.scheduled) throw new Error("expected schedule");

    await t.mutation(internal.marginCallStore.markAttempt, {
      attemptId: scheduled.attemptId,
      status: "placed",
      twilioCallSid: "CA_test",
    });
    await t.mutation(internal.marginCallStore.markAttempt, {
      attemptId: scheduled.attemptId,
      status: "skipped",
      reason: "not_opted_in",
    });

    const attempt = await t.query(internal.marginCallStore.getAttempt, {
      attemptId: scheduled.attemptId,
    });
    expect(attempt).toMatchObject({
      status: "placed",
      twilioCallSid: "CA_test",
    });
    expect(attempt?.reason).toBeUndefined();
  });
});
