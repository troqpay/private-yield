import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { createDemoApiHandler, type DemoService } from "../server/demo/api";

const VALID_LEAF = "123";

// A request with one body chunk and a fixed peer address.
function request(body: string, ip = "10.0.0.1") {
  const emitter = new EventEmitter() as IncomingMessage;
  emitter.method = "POST";
  emitter.socket = { remoteAddress: ip } as IncomingMessage["socket"];
  // The handler reads the body with `for await`, so the stream must end.
  emitter[Symbol.asyncIterator] = async function* () {
    yield body;
  };
  return emitter;
}

function response() {
  const sent: { status: number; body: { status: string; code?: string } }[] = [];
  const res = {
    writeHead: vi.fn(),
    end: vi.fn((payload: string) => {
      sent.push({ status: res.writeHead.mock.calls.at(-1)![0] as number, body: JSON.parse(payload) });
    }),
  };
  return { res: res as unknown as ServerResponse, sent };
}

function handler(clock: { now: number }, peersMax?: number) {
  const service = { admit: vi.fn(async () => ({ transactionHash: "hash" })) } as unknown as DemoService;
  return { handle: createDemoApiHandler(service, () => clock.now, peersMax), service };
}

async function admit(handle: ReturnType<typeof createDemoApiHandler>, body: string, ip?: string) {
  const { res, sent } = response();
  await handle(request(body, ip), res, "/api/demo/admit");
  return sent[0]!;
}

describe("Demo admission limit", () => {
  it("does not spend the quota on malformed requests", async () => {
    const clock = { now: 0 };
    const { handle, service } = handler(clock);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect((await admit(handle, "not json")).status).toBe(400);
      expect((await admit(handle, JSON.stringify({ aspLeaf: 7 }))).status).toBe(400);
      expect((await admit(handle, JSON.stringify({ aspLeaf: "0" }))).status).toBe(400);
    }
    expect((await admit(handle, JSON.stringify({ aspLeaf: VALID_LEAF }))).status).toBe(200);
    expect(service.admit).toHaveBeenCalledTimes(1);
  });

  it("allows 20 valid admissions an hour per peer, then refuses until the hour passes", async () => {
    const clock = { now: 0 };
    const { handle } = handler(clock);
    const body = JSON.stringify({ aspLeaf: VALID_LEAF });

    for (let attempt = 0; attempt < 20; attempt += 1) expect((await admit(handle, body)).status).toBe(200);
    expect(await admit(handle, body)).toMatchObject({ status: 429, body: { code: "rate_limited" } });
    // Another peer keeps its own quota.
    expect((await admit(handle, body, "10.0.0.2")).status).toBe(200);
    clock.now += 3_600_000;
    expect((await admit(handle, body)).status).toBe(200);
  });

  it("forgets peers whose hour is over instead of keeping every address ever seen", async () => {
    const clock = { now: 0 };
    const { handle } = handler(clock, 50);
    const body = JSON.stringify({ aspLeaf: VALID_LEAF });

    for (let peer = 0; peer < 50; peer += 1) await admit(handle, body, `10.1.0.${peer}`);
    // The map is full: one more new peer evicts the oldest instead of growing,
    // and the evicted peer is simply counted afresh.
    expect((await admit(handle, body, "10.9.9.9")).status).toBe(200);
    expect((await admit(handle, body, "10.1.0.0")).status).toBe(200);
    clock.now += 3_600_000;
    // After the hour every old peer is dropped on the next request and gets a
    // fresh quota, so eviction never locks anyone out.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await admit(handle, body, "10.1.0.1")).status).toBe(200);
    }
    expect((await admit(handle, body, "10.1.0.1")).status).toBe(429);
  });
});
