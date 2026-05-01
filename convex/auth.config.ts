// Set on the Convex backend via: npx convex env set PRIVY_APP_ID <value> --prod
// (Distinct from NEXT_PUBLIC_PRIVY_APP_ID, which is read by the Next.js client.)
const privyAppId = process.env.PRIVY_APP_ID;

// Privy JWKS: https://auth.privy.io/api/v1/apps/{appId}/jwks.json
// Privy issuer: https://auth.privy.io

const authConfig = {
  providers: [
    {
      domain: "https://auth.privy.io",
      applicationID: privyAppId ?? "",
    },
  ],
};

export default authConfig;
