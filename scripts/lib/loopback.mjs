/**
 * True only for a server on this machine: http://localhost, 127.0.0.1 or
 * [::1], any port. Smoke modes that sign with local identities or read the
 * TroqPay view key hand those capabilities to the page they open, so they
 * never run against any other origin.
 */
export function isLoopback(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}
