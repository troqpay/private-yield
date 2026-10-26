import { describe, expect, it } from "vitest";

import { isLoopback } from "../scripts/lib/loopback.mjs";

describe("Smoke privileged-mode origin rule", () => {
  it("accepts only a plain-http server on this machine", () => {
    for (const url of ["http://localhost:5173/", "http://127.0.0.1:8080/", "http://[::1]:8080/", "http://localhost/"]) {
      expect(isLoopback(url), url).toBe(true);
    }
  });

  it("rejects every other origin, however it is spelled", () => {
    for (const url of [
      "https://localhost:5173/",
      "http://localhost.evil.example/",
      "http://evil.example/",
      "https://troqpay-app-stellar-testnet.up.railway.app/",
      "http://127.0.0.1.nip.io/",
      "http://0.0.0.0:8080/",
      "http://[::ffff:127.0.0.1]:8080/",
      "file:///C:/demo/index.html",
      "not a url",
    ]) {
      expect(isLoopback(url), url).toBe(false);
    }
  });
});
