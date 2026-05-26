import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

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

const mockSubjectPrefix = "did:privy:welcome-test";

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

describe("welcome email on signup", () => {
  it("schedules welcome on first upsertMe with email", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "welcome_1" } });
    const t = convexTest(schema, modules);
    const subj = `${mockSubjectPrefix}:first`;
    const authed = t.withIdentity({
      subject: subj,
      tokenIdentifier: subj,
      issuer: "https://auth.privy.io",
      email: "NEW@MARGINCALL.FUN",
    });

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0x1111111111111111111111111111111111111111",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Margin Call <admin@margincall.fun>",
        to: "new@margincall.fun",
        subject:
          "Welcome to the floor — fund your desk and hire your first trader",
      })
    );

    const desk = await authed.query(api.deskManagers.getMe, {});
    expect(desk?.welcomeEmailSentAt).toBeDefined();
  });

  it("does not send duplicate welcome on later upsertMe", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "welcome_1" } });
    const t = convexTest(schema, modules);
    const subj = `${mockSubjectPrefix}:dup`;
    const authed = t.withIdentity({
      subject: subj,
      tokenIdentifier: subj,
      issuer: "https://auth.privy.io",
      email: "dup@margincall.fun",
    });

    await authed.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0x2222222222222222222222222222222222222222",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(resendMocks.send).toHaveBeenCalledTimes(1);

    await authed.mutation(api.deskManagers.upsertMe, {
      displayName: "Updated",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(resendMocks.send).toHaveBeenCalledTimes(1);
  });

  it("schedules welcome from syncWalletBalance insert when email present", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "welcome_sync" } });
    const t = convexTest(schema, modules);
    const subj = `${mockSubjectPrefix}:sync`;

    await t.mutation(internal.deskManagers.syncWalletBalance, {
      subject: subj,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      balanceUsdc: 0,
      email: "SYNC@margincall.fun",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);

    const desk = await t.run(async (ctx) =>
      ctx.db
        .query("deskManagers")
        .withIndex("bySubject", (q) => q.eq("subject", subj))
        .unique()
    );
    expect(desk?.email).toBe("sync@margincall.fun");
    expect(desk?.welcomeEmailSentAt).toBeDefined();
  });

  it("schedules welcome when syncWalletBalance backfills email on patch", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "welcome_sync_patch" } });
    const t = convexTest(schema, modules);
    const subj = `${mockSubjectPrefix}:sync-patch`;

    await t.mutation(internal.deskManagers.syncWalletBalance, {
      subject: subj,
      walletAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
      balanceUsdc: 0,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(resendMocks.send).not.toHaveBeenCalled();

    await t.mutation(internal.deskManagers.syncWalletBalance, {
      subject: subj,
      walletAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
      balanceUsdc: 1,
      email: "PATCHSYNC@margincall.fun",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "patchsync@margincall.fun" })
    );
  });

  it("schedules welcome when email is backfilled on upsertMe patch", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendMocks.send.mockResolvedValue({ data: { id: "welcome_backfill" } });
    const t = convexTest(schema, modules);
    const subj = `${mockSubjectPrefix}:backfill`;

    const noEmail = t.withIdentity({
      subject: subj,
      tokenIdentifier: subj,
      issuer: "https://auth.privy.io",
    });
    await noEmail.mutation(api.deskManagers.upsertMe, {
      walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(resendMocks.send).not.toHaveBeenCalled();

    const withEmail = t.withIdentity({
      subject: subj,
      tokenIdentifier: subj,
      issuer: "https://auth.privy.io",
      email: "BACKFILL@margincall.fun",
    });
    await withEmail.mutation(api.deskManagers.upsertMe, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "backfill@margincall.fun" })
    );
  });

  it("sendWelcomeEmail skips without marking sent when Resend is unavailable", async () => {
    const t = convexTest(schema, modules);
    const dmId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("deskManagers", {
        subject: `${mockSubjectPrefix}:no-resend`,
        email: "no-resend@margincall.fun",
        walletAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        settings: {},
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.action(internal.emails.sendWelcomeEmail, {
      deskManagerId: dmId,
    });
    expect(result).toMatchObject({ ok: true, status: "skipped" });

    const desk = await t.run(async (ctx) => ctx.db.get(dmId));
    expect(desk?.welcomeEmailSentAt).toBeUndefined();
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("allows a guarded CLI test welcome email with OPERATOR_SECRET", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.OPERATOR_SECRET = "test-operator-secret";
    resendMocks.send.mockResolvedValue({ data: { id: "email_welcome_cli" } });
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.emails.sendTestWelcomeEmail, {
        operatorSecret: "test-operator-secret",
        toEmail: "CLI@MARGINCALL.FUN",
      })
    ).resolves.toEqual({
      ok: true,
      status: "sent",
      resendId: "email_welcome_cli",
    });

    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cli@margincall.fun",
        subject:
          "Welcome to the floor — fund your desk and hire your first trader",
      })
    );
  });
});
