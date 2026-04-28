const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

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
