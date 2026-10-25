import init, {
  bootnodeRequired,
  Client,
  Storage,
  type CircuitLockInput,
  type ContractConfigInput,
} from "stellar-private-payments";

import circuitsJson from "./config/circuits.json";
import deploymentsJson from "./config/testnet-deployments.json";
import troqpayDeploymentsJson from "./config/troqpay-testnet-deployments.json";

// Pinned to NethermindEth/stellar-private-payments@ea39d0c, whose circuit
// fingerprints match the bundled artifacts of stellar-private-payments@0.2.1.
// ?deployment=troqpay selects the TroqPay USDC/EURC pools (allowlist +
// blocklist, traceable view key) deployed from the same commit.
const useTroqpayDeployment =
  new URLSearchParams(window.location.search).get("deployment") === "troqpay";
export const contractConfig = (useTroqpayDeployment ? troqpayDeploymentsJson : deploymentsJson) as ContractConfigInput & {
  rpcUrl: string;
  networkPassphrase: string;
};
const circuitLock = circuitsJson as CircuitLockInput;

export const RPC_URL = contractConfig.rpcUrl;
export const NETWORK_PASSPHRASE = contractConfig.networkPassphrase;

// Vite serves the installed SDK package as is (see vite.config.ts).
const CIRCUITS_BASE_URL = new URL(
  "/node_modules/stellar-private-payments/dist/circuits/",
  window.location.origin,
).href;

export type BootStage =
  | "init"
  | "storage"
  | "bootnode-check"
  | "client"
  | "sync"
  | "ready";

let clientPromise: ReturnType<typeof startSppClient> | null = null;

/** One SDK client per page: the OPFS storage must not be opened twice. */
export function getSppClient(onStage: (stage: BootStage) => void = () => {}) {
  clientPromise ??= startSppClient(onStage);
  return clientPromise;
}

async function startSppClient(onStage: (stage: BootStage) => void) {
  onStage("init");
  await init();
  onStage("storage");
  const storage = await Storage.open();
  onStage("bootnode-check");
  const needsBootnode = await bootnodeRequired(RPC_URL, storage, {
    contractConfig,
  });
  onStage("client");
  const client = await Client.new({
    rpcUrl: RPC_URL,
    storage,
    contractConfig,
    circuitsBaseUrl: CIRCUITS_BASE_URL,
    circuitLock,
  });
  onStage("sync");
  await client.sync();
  onStage("ready");
  return { client, needsBootnode };
}
