import { Account, Keypair, nativeToScVal, Networks, rpc, scValToNative, type Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { assertTestnet, createDemoService, type DemoServiceConfig } from "../server/demo/api";
import deployment from "../src/config/demo-testnet-deployments.json";

const sharePool = deployment.pools.find((pool) => pool.asset.kind === "contract")!;
const config: DemoServiceConfig = {
  aspMembership: deployment.asp_membership,
  aspDeploymentLedger: 5382797,
  pool: sharePool.poolContractId,
  vault: sharePool.asset.contractId!,
  usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  aspAdmin: Keypair.random(),
  treasury: Keypair.random(),
  viewKey: "0xdemo",
  yieldStroops: BigInt(20_000_000),
  dailyCapStroops: BigInt(600_000_000),
};

// An RPC that remembers inserted leaves and reports them as LeafAdded events.
function fakeRpc(admitted: bigint[] = []) {
  const sent: Transaction[] = [];
  const server = {
    getHealth: vi.fn(async () => ({ oldestLedger: 1 })),
    getEvents: vi.fn(async () => ({
      cursor: "",
      events: admitted.map((leaf) => ({ value: nativeToScVal({ leaf }, { type: { leaf: ["symbol", "u256"] } }) })),
    })),
    getAccount: vi.fn(async (address: string) => new Account(address, "1")),
    prepareTransaction: vi.fn(async (transaction: Transaction) => transaction),
    sendTransaction: vi.fn(async (transaction: Transaction) => {
      sent.push(transaction);
      const [operation] = transaction.operations;
      if (operation?.type === "invokeHostFunction") {
        const call = operation.func.invokeContract();
        if (call.functionName().toString() === "insert_leaf") admitted.push(scValToNative(call.args()[0]!) as bigint);
      }
      return { status: "PENDING", hash: `hash_${sent.length}` };
    }),
    pollTransaction: vi.fn(async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS })),
    getNetwork: vi.fn(async () => ({ passphrase: Networks.TESTNET })),
  };
  return { server: server as never, sent };
}

describe("Demo operator", () => {
  it("rejects a leaf outside the BN254 field", async () => {
    const { server, sent } = fakeRpc();
    const service = createDemoService(server, config);
    await expect(service.admit("0")).rejects.toMatchObject({ code: "invalid_leaf" });
    await expect(
      service.admit("21888242871839275222246405745257275088548364400416034343698204186575808495617"),
    ).rejects.toMatchObject({ code: "invalid_leaf" });
    expect(sent).toHaveLength(0);
  });

  it("does not insert a leaf the ASP already holds", async () => {
    const { server, sent } = fakeRpc([BigInt(123)]);
    await expect(createDemoService(server, config).admit("123")).resolves.toEqual({
      alreadyAdmitted: true,
      transactionHash: null,
    });
    expect(sent).toHaveLength(0);
  });

  it("inserts a new leaf once, even for simultaneous requests", async () => {
    const { server, sent } = fakeRpc();
    const service = createDemoService(server, config);
    const results = await Promise.all([service.admit("456"), service.admit("456")]);
    expect(results).toEqual([
      { alreadyAdmitted: false, transactionHash: "hash_1" },
      { alreadyAdmitted: true, transactionHash: null },
    ]);
    expect(sent).toHaveLength(1);
  });

  it("refuses a second simulated yield within 60 seconds", async () => {
    const { server, sent } = fakeRpc();
    let now = 1_000_000;
    const service = createDemoService(server, config, () => now);
    await expect(service.sendYield()).resolves.toEqual({ transactionHash: "hash_1" });
    now += 30_000;
    await expect(service.sendYield()).rejects.toMatchObject({ code: "yield_cooldown" });
    expect(sent).toHaveLength(1);
  });

  it("refuses any network but Stellar Testnet", async () => {
    await expect(
      assertTestnet({ getNetwork: async () => ({ passphrase: "Test SDF Future Network ; October 2022" }) } as never),
    ).rejects.toThrow("demo_service_requires_testnet");
  });
});
