import type { IncomingMessage, ServerResponse } from "node:http";

import {
  Address,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

// The open demo's operator: the only part that holds keys. It admits demo
// companies to the demo ASP (standing in for KYB), sends simulated yield from
// the demo treasury to the vault and hands out the demo pools' view key,
// which is public by design. Stellar Testnet only.

const INCLUSION_FEE = "1000000";
const BN254_PRIME = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const LEAF_ADDED_TOPIC = xdr.ScVal.scvSymbol("LeafAdded").toXDR("base64");
const ADMISSIONS_PER_HOUR = 20;
const YIELD_COOLDOWN_MS = 60_000;

export type DemoRpc = Pick<
  rpc.Server,
  "getAccount" | "getEvents" | "getHealth" | "getNetwork" | "pollTransaction" | "prepareTransaction" | "sendTransaction"
>;

export type DemoServiceConfig = {
  aspMembership: string;
  aspDeploymentLedger: number;
  pool: string;
  vault: string;
  usdcSac: string;
  aspAdmin: Keypair;
  treasury: Keypair;
  viewKey: string;
  yieldStroops: bigint;
  dailyCapStroops: bigint;
};

// No parameter properties: Node runs this file by stripping types only.
export class DemoError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type DemoService = ReturnType<typeof createDemoService>;

export function createDemoService(server: DemoRpc, config: DemoServiceConfig, now: () => number = Date.now) {
  // One operator transaction at a time: the admin and the treasury each have
  // one sequence number, and an admission must re-check LeafAdded after any
  // admission queued before it.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };
  let lastYieldAt = Number.NEGATIVE_INFINITY;
  let yieldDay = "";
  let yieldToday = BigInt(0);

  return {
    async admit(aspLeaf: string) {
      const leaf = parseFieldElement(aspLeaf);
      return serial(async () => {
        if (await isLeafAdmitted(server, config, leaf)) return { alreadyAdmitted: true, transactionHash: null };
        const transactionHash = await invoke(server, config.aspAdmin, config.aspMembership, "insert_leaf", [
          nativeToScVal(leaf, { type: "u256" }),
        ]);
        return { alreadyAdmitted: false, transactionHash };
      });
    },
    sendYield() {
      return serial(async () => {
        const at = now();
        if (at - lastYieldAt < YIELD_COOLDOWN_MS) throw new DemoError("yield_cooldown", 429);
        const day = new Date(at).toISOString().slice(0, 10);
        if (day !== yieldDay) {
          yieldDay = day;
          yieldToday = BigInt(0);
        }
        if (yieldToday + config.yieldStroops > config.dailyCapStroops) throw new DemoError("yield_daily_cap", 429);
        lastYieldAt = at;
        const transactionHash = await invoke(server, config.treasury, config.usdcSac, "transfer", [
          new Address(config.treasury.publicKey()).toScVal(),
          new Address(config.vault).toScVal(),
          nativeToScVal(config.yieldStroops, { type: "i128" }),
        ]);
        yieldToday += config.yieldStroops;
        return { transactionHash };
      });
    },
    viewKey: () => config.viewKey,
    health: () => ({ network: "testnet", asp: config.aspMembership, pool: config.pool, vault: config.vault }),
  };
}

/** Refuses any network but Stellar Testnet. */
export async function assertTestnet(server: Pick<rpc.Server, "getNetwork">): Promise<void> {
  const { passphrase } = await server.getNetwork();
  if (passphrase !== Networks.TESTNET) throw new Error("demo_service_requires_testnet");
}

/** HTTP for /api/demo/*. */
export function createDemoApiHandler(service: DemoService | null, now: () => number = Date.now) {
  const admissions = new Map<string, number[]>();
  const withinAdmissionLimit = (ip: string) => {
    const at = now();
    const recent = (admissions.get(ip) ?? []).filter((time) => at - time < 3_600_000);
    if (recent.length >= ADMISSIONS_PER_HOUR) return false;
    admissions.set(ip, [...recent, at]);
    return true;
  };

  return async function handleDemoApi(request: IncomingMessage, response: ServerResponse, pathname: string) {
    try {
      if (!service) throw new DemoError("demo_service_unconfigured", 503);
      const route = `${request.method} ${pathname}`;
      if (route === "GET /api/demo/health") return send(response, 200, { status: "ok", ...service.health() });
      if (route === "GET /api/demo/view-key") return send(response, 200, { status: "ok", privateKey: service.viewKey() });
      if (route === "POST /api/demo/admit") {
        if (!withinAdmissionLimit(request.socket.remoteAddress ?? "unknown")) throw new DemoError("rate_limited", 429);
        const { aspLeaf } = (await readJson(request)) as { aspLeaf?: unknown };
        if (typeof aspLeaf !== "string") throw new DemoError("invalid_leaf", 400);
        return send(response, 200, { status: "ok", ...(await service.admit(aspLeaf)) });
      }
      if (route === "POST /api/demo/yield") return send(response, 200, { status: "ok", ...(await service.sendYield()) });
      throw new DemoError("not_found", 404);
    } catch (error) {
      const known = error instanceof DemoError ? error : new DemoError("demo_operator_failed", 502);
      if (!(error instanceof DemoError)) console.error("[demo] operator call failed:", error instanceof Error ? error.message : "unknown");
      return send(response, known.httpStatus, { status: "error", code: known.code });
    }
  };
}

function parseFieldElement(value: string): bigint {
  const trimmed = value.trim();
  if (!/^(?:0x[0-9a-f]{1,64}|\d{1,78})$/iu.test(trimmed)) throw new DemoError("invalid_leaf", 400);
  const leaf = BigInt(trimmed);
  if (leaf <= BigInt(0) || leaf >= BN254_PRIME) throw new DemoError("invalid_leaf", 400);
  return leaf;
}

// insert_leaf accepts duplicates, so the ASP's LeafAdded events are checked
// first, as the TroqPay API does.
async function isLeafAdmitted(server: DemoRpc, config: DemoServiceConfig, leaf: bigint): Promise<boolean> {
  const filters = [{ type: "contract" as const, contractIds: [config.aspMembership], topics: [[LEAF_ADDED_TOPIC]] }];
  // RPC keeps about 7 days of events; older admissions fall out of the window.
  const { oldestLedger } = await server.getHealth();
  let request: rpc.Api.GetEventsRequest = {
    startLedger: Math.max(config.aspDeploymentLedger, oldestLedger),
    filters,
    limit: 100,
  };
  for (let page = 0; page < 20; page += 1) {
    const result = await server.getEvents(request);
    for (const event of result.events) {
      const value = scValToNative(event.value) as { leaf?: bigint };
      if (value.leaf === leaf) return true;
    }
    if (result.events.length < 100) return false;
    request = { cursor: result.cursor, filters, limit: 100 };
  }
  return false;
}

async function invoke(server: DemoRpc, signer: Keypair, contract: string, method: string, args: xdr.ScVal[]) {
  const draft = new TransactionBuilder(await server.getAccount(signer.publicKey()), {
    fee: INCLUSION_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({ contract, function: method, args }))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(draft);
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new DemoError(`${method}_rejected`, 502);
  const result = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new DemoError(`${method}_failed`, 502);
  return sent.hash;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2048) throw new DemoError("body_too_large", 413);
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new DemoError("invalid_json", 400);
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

/** The operator from the environment; null when none of its keys are set (static pages only). */
export function demoServiceConfigFromEnv(
  env: NodeJS.ProcessEnv,
  manifest: {
    asp_membership: string;
    pools: { poolContractId: string; deploymentLedger: number; asset: { kind: string; contractId?: string } }[];
  },
): DemoServiceConfig | null {
  const keys = [env.DEMO_ASP_ADMIN_SECRET, env.DEMO_TREASURY_SECRET, env.DEMO_VIEW_KEY];
  if (keys.every((key) => !key?.trim())) return null;
  if (keys.some((key) => !key?.trim())) throw new Error("demo_service_incomplete_configuration");
  const sharePool = manifest.pools.find((pool) => pool.asset.kind === "contract");
  if (!sharePool?.asset.contractId) throw new Error("demo_pool_missing");
  const usdc = (value: string | undefined, fallback: string) => BigInt(Math.round(Number(value ?? fallback) * 1e7));
  return {
    aspMembership: manifest.asp_membership,
    aspDeploymentLedger: Math.min(...manifest.pools.map((pool) => pool.deploymentLedger)),
    pool: sharePool.poolContractId,
    vault: sharePool.asset.contractId,
    usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    aspAdmin: Keypair.fromSecret(env.DEMO_ASP_ADMIN_SECRET!.trim()),
    treasury: Keypair.fromSecret(env.DEMO_TREASURY_SECRET!.trim()),
    viewKey: env.DEMO_VIEW_KEY!.trim(),
    yieldStroops: usdc(env.DEMO_YIELD_USDC, "2"),
    dailyCapStroops: usdc(env.DEMO_DAILY_USDC_CAP, "60"),
  };
}
