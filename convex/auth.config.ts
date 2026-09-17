// No JWT providers yet. Product code does not require authenticated Convex
// identity (empty schema, empty HTTP router). When the first authed Convex
// table or function lands, add Dynamic customJwt here:
//   issuer: `https://app.dynamicauth.com/${DYNAMIC_ENVIRONMENT_ID}`
//   jwks: `https://app.dynamicauth.com/api/v0/sdk/${DYNAMIC_ENVIRONMENT_ID}/.well-known/jwks`
//   algorithm: "RS256"
//   applicationID: exact `aud` from a live Dynamic access token
const authConfig = {
  providers: [],
};

export default authConfig;
