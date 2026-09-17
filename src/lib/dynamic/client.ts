import {
  createDynamicClient,
  initializeClient,
  type DynamicClient,
} from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";

let dynamicClient: DynamicClient | null = null;
let hasRegisteredEvmExtension = false;
let initializePromise: Promise<DynamicClient> | null = null;

/** Public Dynamic environment ID, or undefined when unset. */
export function getDynamicEnvironmentId(): string | undefined {
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  return environmentId && environmentId.length > 0 ? environmentId : undefined;
}

/** True when the app can mount the Dynamic wallet provider. */
export function isDynamicConfigured(): boolean {
  return Boolean(getDynamicEnvironmentId());
}

/**
 * Lazily creates the Dynamic client singleton. Call only when
 * {@link isDynamicConfigured} is true.
 */
export function getDynamicClient(): DynamicClient {
  const environmentId = getDynamicEnvironmentId();
  if (!environmentId) {
    throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not configured");
  }

  if (!dynamicClient) {
    dynamicClient = createDynamicClient({
      environmentId,
      // Initialize from the provider so SSR never races auto-init.
      autoInitialize: false,
      metadata: {
        name: "Margin Call",
        universalLink:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  }

  if (!hasRegisteredEvmExtension) {
    addEvmExtension();
    hasRegisteredEvmExtension = true;
  }

  return dynamicClient;
}

/** Initializes the singleton once and returns it. */
export function ensureDynamicClientInitialized(): Promise<DynamicClient> {
  if (!initializePromise) {
    initializePromise = (async () => {
      const client = getDynamicClient();
      await initializeClient(client);
      return client;
    })();
  }

  return initializePromise;
}

/** Test-only reset for the module singleton. */
export function resetDynamicClientForTests(): void {
  dynamicClient = null;
  hasRegisteredEvmExtension = false;
  initializePromise = null;
}
