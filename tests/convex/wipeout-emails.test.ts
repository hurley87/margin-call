import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../../convex/_generated/api";
import { isResendConfigured } from "../../convex/emails";
import schema from "../../convex/schema";
import { seedActiveTrader, seedDeal, seedDeskManager } from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: resendMocks.send,
    };
  },
}));

async function seedWipeout(t: ReturnType<typeof convexTest<typeof schema>>) {
  const dmId = await seedDeskManager(t, {
    email: "desk@margincall.fun",
  });
  const traderId = await seedActiveTrader(t, dmId, {
    name: "CrashTest",
    escrowBalance: 100,
  });
  const dealId = await seedDeal(t);
  const outcomeId = await t.mutation(internal.dealOutcomes.apply, {
    dealId: dealId as never,
    traderId,
    traderPnlUsdc: -100,
    traderWipedOut: true,
  });
  return { traderId, outcomeId };
}

async function listNotifications(
  t: ReturnType<typeof convexTest<typeof schema>>
) {
  return t.run(async (ctx) =>
    ctx.db.query("emailNotifications").order("asc").collect()
  );
}

const originalResendApiKey = process.env.RESEND_API_KEY;
const originalOperatorSecret = process.env.OPERATOR_SECRET;

beforeEach(() => {
  vi.useFakeTimers();
  resendMocks.send.mockReset();
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  vi.useRealTimers();
  if (originalResendApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalResendApiKey;
  }
  if (originalOperatorSecret === undefined) {
    delete process.env.OPERATOR_SECRET;
  } else {
    process.env.OPERATOR_SECRET = originalOperatorSecret;
  }
});

describe("Resend config check", () => {
  it("treats blank API keys as unavailable", () => {
    expect(isResendConfigured(undefined)).toBe(false);
    expect(isResendConfigured("   ")).toBe(false);
    expect(isResendConfigured("re_test_key")).toBe(true);
  });
});

describe("wipeout email notifications", () => {
  it("allows a guarded CLI test email with OPERATOR_SECRET and explicit recipient", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.OPERATOR_SECRET = "test-operator-secret";
    resendMocks.send.mockResolvedValue({ data: { id: "email_cli" } });
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.emails.sendTestWipeoutEmail, {
        operatorSecret: "test-operator-secret",
        toEmail: "CLI@MARGINCALL.FUN",
      })
    ).resolves.toEqual({ ok: true, status: "sent", resendId: "email_cli" });

    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cli@margincall.fun",
        subject: "Margin call: Test Trader has been wiped out",
      })
    );
  });

  it("rejects unauthenticated CLI test emails without OPERATOR_SECRET", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.emails.sendTestWipeoutEmail, {
        toEmail: "cli@margincall.fun",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  it("sends a wipeout email on the first wiped-out transition", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "email_123" } });
    const t = convexTest(schema, modules);
    const { traderId, outcomeId } = await seedWipeout(t);

    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -100,
      outcomeId: outcomeId as never,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Margin Call <admin@margincall.fun>",
        to: "desk@margincall.fun",
        subject: "Margin call: CrashTest has been wiped out",
      })
    );

    const notifications = await listNotifications(t);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("sent");
    expect(notifications[0]?.resendId).toBe("email_123");
  });

  it("does not send duplicate emails for the same trader wipeout", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "email_123" } });
    const t = convexTest(schema, modules);
    const { traderId, outcomeId } = await seedWipeout(t);

    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -100,
      outcomeId: outcomeId as never,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const secondDealId = await seedDeal(t);
    const secondOutcomeId = await t.mutation(internal.dealOutcomes.apply, {
      dealId: secondDealId as never,
      traderId,
      traderPnlUsdc: -50,
      traderWipedOut: true,
    });
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -50,
      outcomeId: secondOutcomeId as never,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const notifications = await listNotifications(t);
    expect(notifications).toHaveLength(1);
  });

  it("completes the wipeout transition when Resend is unavailable", async () => {
    const t = convexTest(schema, modules);
    const { traderId, outcomeId } = await seedWipeout(t);

    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -100,
      outcomeId: outcomeId as never,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("wiped_out");
    expect(resendMocks.send).not.toHaveBeenCalled();

    const notifications = await listNotifications(t);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("skipped");
    expect(notifications[0]?.reason).toBe("resend_unavailable");
  });

  it("completes the wipeout transition when Resend fails", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({
      error: { message: "Resend rejected the message" },
    });
    const t = convexTest(schema, modules);
    const { traderId, outcomeId } = await seedWipeout(t);

    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -100,
      outcomeId: outcomeId as never,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("wiped_out");

    const notifications = await listNotifications(t);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("failed");
    expect(notifications[0]?.error).toBe("Resend rejected the message");
  });
});
