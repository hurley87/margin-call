import type { PrivyClientConfig } from "@privy-io/react-auth";

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["wallet", "email", "google", "twitter"],
  appearance: {
    theme: "dark",
    accentColor: "#22c55e",
    logo: undefined,
  },
};
