// Set on the Convex backend via: npx convex env set PRIVY_APP_ID <value> --prod
// (Distinct from NEXT_PUBLIC_PRIVY_APP_ID, which is read by the Next.js client.)
const privyAppId = process.env.PRIVY_APP_ID ?? "";

// Privy access tokens use the bare string `privy.io` as the `iss` claim and
// publish JWKS at a non-standard path, so we use Convex's customJwt provider
// to specify the issuer and JWKS URL explicitly. The default OIDC provider
// would 404 on `https://auth.privy.io/.well-known/jwks.json`.
const authConfig = {
  providers: [
    {
      type: "customJwt",
      issuer: "privy.io",
      jwks: `https://auth.privy.io/api/v1/apps/${privyAppId}/jwks.json`,
      algorithm: "ES256",
      applicationID: privyAppId,
    },
  ],
};

export default authConfig;
