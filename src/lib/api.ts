import { getAccessToken } from "@privy-io/react-auth";

export async function authFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
