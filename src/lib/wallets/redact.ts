/**
 * Strip known secrets from a string before it is printed. Used at the Dynamic
 * SDK boundary and the CLI so API tokens, backup passwords, and similar
 * material never appear in logs.
 */
export function redactSecrets(
  text: string,
  secrets: readonly (string | undefined)[]
): string {
  let result = text;
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      result = result.split(secret).join("[redacted]");
    }
  }
  return result;
}
