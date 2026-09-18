import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { resolveBaseWalletClient } from "@/lib/dynamic/resolve-wallet-client";
import type { BaseWalletClient } from "@/lib/dynamic/wallet-client";
import type { TxPhase } from "@/lib/protocol/tx-phase";
import { ProtocolTxError } from "@/lib/protocol/writes";

/** Flow result carrying the confirmed transaction, when the flow sent one. */
export type ManagedTxResult = { hash?: `0x${string}` };

export type RunManagedTxArgs<T extends ManagedTxResult> = {
  /** Action label for the pending and error phases — what the button says. */
  label: string;
  accounts: readonly WalletAccount[];
  setTxPhase: (phase: TxPhase) => void;
  run: (
    walletClient: BaseWalletClient,
    onSubmitted: (hash: `0x${string}`, stepLabel: string) => void
  ) => Promise<T>;
};

/**
 * Drive one wallet write through `TxPhase`: resolve a Base client, sign, confirm.
 * Confirmation is labelled by the last step the flow submitted, so multi-step
 * flows (approve then write) report the write. Returns null when nothing landed.
 */
export async function runManagedTx<T extends ManagedTxResult>(
  args: RunManagedTxArgs<T>
): Promise<T | null> {
  const { label, accounts, setTxPhase, run } = args;

  const walletClient = resolveBaseWalletClient(accounts);
  if (!walletClient) {
    setTxPhase({
      status: "error",
      label,
      message: "No Base wallet client. Reconnect an EVM wallet.",
    });
    return null;
  }

  let submittedHash: `0x${string}` | undefined;
  let submittedLabel = label;

  try {
    setTxPhase({ status: "awaiting-signature", label });

    const result = await run(walletClient, (hash, stepLabel) => {
      submittedHash = hash;
      submittedLabel = stepLabel;
      setTxPhase({ status: "submitted", label: stepLabel, hash });
    });

    setTxPhase(
      result.hash
        ? { status: "confirmed", label: submittedLabel, hash: result.hash }
        : { status: "idle" }
    );
    return result;
  } catch (error) {
    const hash = error instanceof ProtocolTxError ? error.hash : submittedHash;
    setTxPhase({
      status: "error",
      label,
      message: error instanceof Error ? error.message : `${label} failed`,
      ...(hash ? { hash } : {}),
    });
    return null;
  }
}
