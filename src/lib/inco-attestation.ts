import { toHex, type Hex } from "viem";

export type CrashAttestation = {
  plaintext: bigint;
  signatures: Hex[];
};

type LightningClient = {
  attestedReveal: (handles: Hex[]) => Promise<
    Array<{
      plaintext: { value: string | number | bigint };
      covalidatorSignatures: Uint8Array[];
    }>
  >;
};

const DEFAULT_BASE_SEPOLIA_RPC = "https://sepolia.base.org";

/**
 * Fetches an Inco covalidator attestation for a revealed crash handle.
 * Intended for Node (API route / smoke). Retries briefly because ACL
 * propagation can lag the onchain Reveal event.
 */
export async function fetchCrashAttestation(
  crashRandom: Hex,
  options: { rpcUrl?: string; attempts?: number; delayMs?: number } = {}
): Promise<CrashAttestation> {
  const rpcUrl =
    options.rpcUrl ??
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
    DEFAULT_BASE_SEPOLIA_RPC;
  const attempts = options.attempts ?? 12;
  const delayMs = options.delayMs ?? 10_000;
  const lightning = await loadLightningClient(rpcUrl);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const attestations = await lightning.attestedReveal([crashRandom]);
      const attestation = attestations[0];
      if (!attestation) {
        throw new Error("No attestation returned for the crash handle");
      }
      return {
        plaintext: BigInt(attestation.plaintext.value),
        signatures: attestation.covalidatorSignatures.map((signature) =>
          toHex(signature)
        ),
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : "Attestation request failed";
  throw new Error(detail);
}

/** Browser-safe helper that asks the Next.js attestation route. */
export async function requestCrashAttestation(
  crashRandom: Hex
): Promise<CrashAttestation> {
  const response = await fetch("/api/crash-attestation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ crashRandom }),
  });
  const body = (await response.json()) as {
    plaintext?: string;
    signatures?: Hex[];
    error?: string;
  };
  if (!response.ok || !body.plaintext || !body.signatures) {
    throw new Error(body.error ?? "Attestation request failed");
  }
  return {
    plaintext: BigInt(body.plaintext),
    signatures: body.signatures,
  };
}

type LightningModule = {
  Lightning?: {
    baseSepoliaTestnet: (opts: {
      hostChainRpcUrls: string[];
    }) => Promise<LightningClient>;
  };
  default?: LightningModule;
};

async function loadLightningClient(rpcUrl: string): Promise<LightningClient> {
  // Prefer the CJS lite build used by the smoke script; fall back to package root.
  let mod: LightningModule;
  try {
    mod =
      (await import("@inco/lightning-js/lite")) as unknown as LightningModule;
  } catch {
    mod = (await import("@inco/lightning-js")) as unknown as LightningModule;
  }
  const Lightning = mod.Lightning ?? mod.default?.Lightning;
  if (!Lightning) {
    throw new Error("Unable to load Inco Lightning client");
  }
  return Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [rpcUrl] });
}
