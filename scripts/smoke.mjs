// Environment smoke test against Stellar Testnet in headless Chrome or Edge.
//   node scripts/smoke.mjs             boot + sync, no wallet
//   node scripts/smoke.mjs --transact  register, deposit, private transfer, balances
//   add --ephemeral to generate and fund disposable testnet identities in memory
//   add --fee-bump to wrap every transaction in a fee bump paid by the testnet
//   identity troqpay-hack-sponsor, as the TroqPay sponsor does
//   add --troqpay-pools to run the same flow on the TroqPay USDC pool
//   (allowlist + blocklist, traceable view key): the ASP admin
//   troqpay-privatepay-admin admits A and B, and the TroqPay view key audits
//   the pool afterwards
//   --pay-to G… pays that TroqPay company 1 vault share privately from
//   privatepay-b on the Private Yield pool, so the App shows a received payment
// --transact signs in this Node process with the testnet Stellar CLI identities
// privatepay-a / privatepay-b. Keys never reach the page or the output.
//   --url <base> checks an already running server instead of the Vite dev server
//   --demo <url> runs the five steps of the open demo page at <url>, as a visitor
//   would (its disposable keys stay in the page)
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Asset, Keypair, Networks, rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import { chromium } from "playwright-core";

// --url <base> checks a server that is already running (for example
// `npm run build && npm start`) instead of starting the Vite dev server.
const URL_ARG = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;
const DEMO_URL = process.argv.includes("--demo") ? process.argv[process.argv.indexOf("--demo") + 1] : null;
const BASE_URL = DEMO_URL ?? URL_ARG ?? "http://localhost:5173/";
const DEMO_STEPS = ["setup", "pay", "yield", "prove", "cashout"];
const DEMO_STEP_TIMEOUT_MS = 10 * 60_000;
const TIMEOUT_MS = 5 * 60_000;
// --yield runs the flow on the pool of TroqPay vault shares (DeFindex), then
// simulates yield and redeems B's shares for USDC.
const PAY_TO = process.argv.includes("--pay-to") ? process.argv[process.argv.indexOf("--pay-to") + 1] : null;
const PAY_TO_SHARES = "10000000"; // 1 share
const YIELD = Boolean(PAY_TO) || process.argv.includes("--yield");
// --inspect (with --yield or --troqpay-pools) only reads: B's private balance
// and the TroqPay view-key audit of the pool, with no transaction.
const INSPECT = process.argv.includes("--inspect");
const TROQPAY_POOLS = YIELD || process.argv.includes("--troqpay-pools");
const TRANSACT = TROQPAY_POOLS || process.argv.includes("--transact");
const EPHEMERAL = process.argv.includes("--ephemeral");
const FEE_BUMP = process.argv.includes("--fee-bump");
const FEE_BUMP_BASE_FEE = "1000000"; // Soroban inclusion floor, as in troqpay-api
// Stellar RPC only: Horizon is end-of-life.
const RPC = new rpc.Server("https://soroban-testnet.stellar.org");
const TROQPAY_DEPLOYMENT = JSON.parse(readFileSync("src/config/troqpay-testnet-deployments.json", "utf8"));
// TroqPay vault-share pool, TroqPay USDC pool, or the first public testnet
// pool: native XLM, blocklist policy, no view key.
const YIELD_POOL = TROQPAY_DEPLOYMENT.pools.find((pool) => pool.asset.kind === "contract");
const POOL = YIELD
  ? YIELD_POOL.poolContractId
  : TROQPAY_POOLS
    ? TROQPAY_DEPLOYMENT.pools.find((pool) => pool.asset.code === "USDC").poolContractId
    : "CA4J475XJXKSHL2RCFLNQSQEB5DN4NA5QHBVCACH2WKGZLZVXT2ZFMS7";
const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const SIMULATED_YIELD = "20000000"; // 2 USDC sent to the vault by TroqPay, testnet only
const PAGE_SEARCH = TROQPAY_POOLS ? "?smoke=1&deployment=troqpay" : "?smoke=1";
// Friendbot funds a fresh account with 10,000 test XLM today, but keep the
// disposable flow small so it also works if that amount changes.
const DEPOSIT = EPHEMERAL ? "50000000" : "100000000"; // 5 or 10 units
const TRANSFER = EPHEMERAL ? "20000000" : "40000000"; // 2 or 4 units
const ASP_ADMIN = "troqpay-privatepay-admin";
// The view key and the admitted leaves live outside the repository.
const LOCAL_KEYS_DIR =
  process.env.PRIVATE_YIELD_KEYS_DIR ?? join(process.env.LOCALAPPDATA ?? homedir(), "troqpay-hackmeridian");
const GVK_PRIVATE_KEY_FILE = join(LOCAL_KEYS_DIR, "keys", "troqpay-gvk-d.json");
// insert_leaf does not reject duplicates, so remember which leaves were admitted.
const ADMITTED_LEAVES_FILE = join(LOCAL_KEYS_DIR, "asp-admitted-leaves.json");
// Canonical selective-disclosure verifying-key hashes, pinned out of band from
// deployments/testnet/circuit_keys/README.md @ ea39d0c. Never trust the
// vkHash inside a receipt.
const CANONICAL_VK_HASHES = {
  selectiveDisclosure_1: "0x6fc11e281a749639762df720450be1182051c93d83e6cff36248896508d85ee2",
  selectiveDisclosure_2: "0x0a4def6573b3982661a2afc082f07cbd88baaa61734c612291434a771879f75e",
};
const STELLAR_CLI =
  process.env.STELLAR_CLI ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\Stellar CLI\\stellar.exe" : "stellar");

const vite =
  URL_ARG || DEMO_URL
    ? null
    : spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: ["ignore", "pipe", "pipe"] });
vite?.stderr.on("data", (chunk) => process.stderr.write(chunk));

let browser;
try {
  await waitForServer();
  browser = await launchSmokeBrowser();
  if (DEMO_URL) {
    await demo();
  } else if (TRANSACT) {
    await transact();
  } else {
    // "/" is the open demo; the environment check lives at ?check=1.
    const page = await openPage(await browser.newContext(), "?check=1");
    const status = await waitForReady(page.page);
    report({ ...summarize(status), consoleErrors: page.errors.slice(0, 5) });
    process.exitCode = status?.stage === "ready" && status.publicFeed !== null ? 0 : 1;
  }
} finally {
  await browser?.close();
  vite?.kill();
}

// The open demo page, step by step: each step must end in data-state="done".
async function demo() {
  const { page, errors } = await openPage(await browser.newContext(), "");
  await page.waitForSelector("[data-testid=step-setup]:not([disabled])", { timeout: TIMEOUT_MS });
  const steps = {};
  for (const step of DEMO_STEPS) {
    const button = page.locator(`[data-testid=step-${step}]`);
    const started = Date.now();
    await button.click();
    await page.waitForFunction(
      (id) => ["done", "error"].includes(document.querySelector(`[data-testid=step-${id}]`)?.getAttribute("data-state") ?? ""),
      step,
      { timeout: DEMO_STEP_TIMEOUT_MS },
    );
    const state = await button.getAttribute("data-state");
    const error = state === "error" ? await button.locator("xpath=..").locator(".error").textContent() : null;
    steps[step] = { state, seconds: Math.round((Date.now() - started) / 1000), error };
    if (state !== "done") break;
  }
  report({
    steps,
    publicLedger: await page
      .locator("[data-testid=panel-public] a[data-label]")
      .evaluateAll((links) => links.map((link) => ({ label: link.getAttribute("data-label"), href: link.href }))),
    auditor: await page.locator("[data-testid=panel-auditor] li").allTextContents(),
    receipt: (await page.locator("[data-testid=receipt]").allTextContents())[0] ?? null,
    cashOut: (await page.locator("[data-testid=cashout]").allTextContents())[0] ?? null,
    consoleErrors: errors.slice(0, 5),
  });
  const results = Object.values(steps);
  process.exitCode = results.length === DEMO_STEPS.length && results.every((step) => step.state === "done") ? 0 : 1;
}

async function transact() {
  if (EPHEMERAL && (TROQPAY_POOLS || FEE_BUMP)) {
    throw new Error("--ephemeral supports the public XLM pool without --fee-bump");
  }
  const accounts = EPHEMERAL
    ? await createEphemeralAccounts()
    : ["privatepay-a", "privatepay-b"].map(loadIdentity);
  const [a, b] = accounts;
  const keypairs = new Map(accounts.map((account) => [account.address, account.keypair]));
  const sponsor = FEE_BUMP ? loadIdentity("troqpay-hack-sponsor") : null;
  const sign = async (kind, payload, address, networkPassphrase) => {
    if (networkPassphrase !== Networks.TESTNET) throw new Error("dev signer refuses non-testnet networks");
    const keypair = keypairs.get(address);
    if (!keypair) throw new Error("unknown dev account");
    if (kind === "message") {
      const prefixed = Buffer.concat([Buffer.from("Stellar Signed Message:\n"), Buffer.from(payload, "utf8")]);
      return keypair.sign(sha256(prefixed)).toString("base64");
    }
    if (kind === "authEntry") return keypair.sign(sha256(Buffer.from(payload, "base64"))).toString("base64");
    if (kind === "transaction") {
      const tx = TransactionBuilder.fromXDR(payload, Networks.TESTNET);
      tx.sign(keypair);
      if (!sponsor) return tx.toXDR();
      const feeBump = TransactionBuilder.buildFeeBumpTransaction(
        sponsor.keypair,
        FEE_BUMP_BASE_FEE,
        tx,
        Networks.TESTNET,
      );
      feeBump.sign(sponsor.keypair);
      return feeBump.toXDR();
    }
    throw new Error(`unknown sign kind ${kind}`);
  };

  // One browser context per company: separate OPFS storage, like two devices.
  const pages = {};
  for (const account of accounts) {
    const context = await browser.newContext();
    await context.exposeFunction("__sppDevSign", sign);
    pages[account.alias] = await openPage(context, PAGE_SEARCH);
    const status = await waitForReady(pages[account.alias].page);
    if (status?.stage !== "ready") throw new Error(`${account.alias} did not boot: ${status?.error}`);
  }
  const run = (account, step, ...args) =>
    timed(`${account.alias} ${step}`, () =>
      pages[account.alias].page.evaluate(
        ([name, params]) => window.__privatepaySmoke[name](...params),
        [step, args],
      ),
    );

  const results = {
    accounts: { a: a.address, b: b.address },
    pool: POOL,
    registerB: await run(b, "register", b.address),
  };
  if (PAY_TO) {
    if (!/^G[A-Z2-7]{55}$/u.test(PAY_TO)) throw new Error("--pay-to needs a Stellar address");
    results.payTo = PAY_TO;
    results.balanceBBefore = await run(b, "balance", b.address, POOL);
    results.transfer = await retryColdProver(() => run(b, "transfer", b.address, POOL, PAY_TO, PAY_TO_SHARES));
    results.balanceBAfter = await run(b, "balance", b.address, POOL);
    report(results);
    process.exitCode = results.transfer.value?.status === "ok" ? 0 : 1;
    return;
  }
  results.registerA = await run(a, "register", a.address);
  if (INSPECT) {
    results.balanceB = await run(b, "balance", b.address, POOL);
    const viewKey = JSON.parse(readFileSync(GVK_PRIVATE_KEY_FILE, "utf8")).privateKey;
    const audit = await run(a, "audit", a.address, POOL, viewKey);
    const reversed = (hex) => `0x${hex.slice(2).match(/../g).reverse().join("")}`;
    const keys = { [reversed(results.registerB.value?.notePublicKey ?? "0x")]: "B (privatepay-b)" };
    results.latestAudit = (audit.value?.txs ?? []).slice(-2).map((tx) => ({
      ...tx,
      outputs: tx.outputs.map((note) => ({ ...note, pk: keys[note.pk] ?? `${note.pk.slice(0, 10)}…` })),
      inputs: tx.inputs.map((note) => ({ ...note, pk: keys[note.pk] ?? `${note.pk.slice(0, 10)}…` })),
    }));
    report(results);
    return;
  }
  if (TROQPAY_POOLS) results.admission = await admit(accounts, run, a);
  if (YIELD) results.vaultSharesA = ensureVaultShares(a, BigInt(DEPOSIT));
  // Balances accumulate across runs, so check the increase.
  results.balanceBBefore = await run(b, "balance", b.address, POOL);
  const xlmBefore = await publicXlm([a.address, sponsor?.address]);
  results.deposit = await depositOnceAdmitted(() => retryColdProver(() => run(a, "deposit", a.address, POOL, DEPOSIT)));
  results.transfer = await retryColdProver(() => run(a, "transfer", a.address, POOL, b.address, TRANSFER));
  const xlmAfter = await publicXlm([a.address, sponsor?.address]);
  results.feeBump = FEE_BUMP;
  // With a fee bump, A's public XLM drops by exactly the deposit; the sponsor pays fees.
  results.publicXlmDelta = Object.fromEntries(
    Object.keys(xlmAfter).map((address) => [address, (xlmAfter[address] - xlmBefore[address]).toFixed(7)]),
  );
  const expectedB = (BigInt(results.balanceBBefore.value?.balance ?? "0") + BigInt(TRANSFER)).toString();
  results.balanceB = await waitForBalance(() => run(b, "balance", b.address, POOL), expectedB);
  results.balanceA = await run(a, "balance", a.address, POOL);

  // B proves the received note to an authority; a walletless page verifies it.
  results.disclosure = await retryColdProver(() => run(b, "disclose", b.address, POOL));
  const receipt = results.disclosure.value?.receipt;
  if (receipt) {
    // Kept for checking the walletless verification page by hand.
    mkdirSync("smoke-results", { recursive: true });
    writeFileSync("smoke-results/last-receipt.json", `${JSON.stringify(receipt, null, 2)}\n`);
    const verifierContext = await browser.newContext();
    pages.verifier = await openPage(verifierContext, PAGE_SEARCH);
    await waitForReady(pages.verifier.page);
    const expectedVkHash = CANONICAL_VK_HASHES[receipt.circuit?.name];
    results.verification = expectedVkHash
      ? await run({ alias: "verifier" }, "verifyReceipt", receipt, expectedVkHash)
      : { error: `no pinned vk hash for ${receipt.circuit?.name}` };
    results.disclosure.value.receipt = {
      circuit: receipt.circuit,
      context: receipt.context,
      disclosedAmounts: receipt.publicInputs?.amounts,
    };
  }

  // TroqPay compliance decrypts the pool with its view key: the deposit and the
  // transfer, including the spent inputs (traceable mode).
  let audited = true;
  if (TROQPAY_POOLS) {
    const viewKey = JSON.parse(readFileSync(GVK_PRIVATE_KEY_FILE, "utf8")).privateKey;
    results.audit = await run(a, "audit", a.address, POOL, viewKey);
    // Audited notes carry the note public key in the opposite byte order of
    // Account.privacyKeys().notePublicKey.
    const reversed = (hex) => `0x${hex.slice(2).match(/../g).reverse().join("")}`;
    const keys = {
      [reversed(results.registerA.value?.notePublicKey ?? "0x")]: "A",
      [reversed(results.registerB.value?.notePublicKey ?? "0x")]: "B",
    };
    const txs = results.audit.value?.txs ?? [];
    for (const tx of txs) {
      for (const note of [...tx.outputs, ...tx.inputs]) note.pk = keys[note.pk] ?? `${note.pk.slice(0, 10)}…`;
    }
    const latest = txs.slice(-2);
    audited =
      latest[0]?.outputs.some((note) => note.pk === "A" && note.amount === DEPOSIT) &&
      latest[1]?.outputs.some((note) => note.pk === "B" && note.amount === TRANSFER) &&
      latest[1]?.inputs.length > 0;
  }

  // Yield accrues to every share, protected ones included: TroqPay sends USDC
  // to the vault, the share price rises, and B redeems more USDC than it was paid.
  let redeemed = true;
  if (YIELD) {
    const vault = YIELD_POOL.asset.contractId;
    results.sharePriceBefore = sharePrice(vault);
    cli(["contract", "invoke", "--id", USDC_SAC, "--source-account", "troqpay-hack", "--network", "testnet",
      "--", "transfer", "--from", loadIdentity("troqpay-hack").address, "--to", vault, "--amount", SIMULATED_YIELD]);
    results.sharePriceAfter = sharePrice(vault);
    results.withdrawB = await retryColdProver(() => run(b, "withdraw", b.address, POOL, TRANSFER));
    const usdcBefore = await publicAsset(b.address, "USDC");
    cli(["contract", "invoke", "--id", vault, "--source-account", b.alias, "--network", "testnet",
      "--", "withdraw", "--withdraw_shares", TRANSFER, "--min_amounts_out", '["0"]', "--from", b.address]);
    results.redeemedUsdcB = (await publicAsset(b.address, "USDC") - usdcBefore).toFixed(7);
    redeemed = Number(results.redeemedUsdcB) > Number(TRANSFER) / 1e7;
  }

  results.consoleErrors = Object.values(pages).flatMap((page) => page.errors).slice(0, 8);
  report(results);
  const verified = results.verification?.value;
  process.exitCode =
    results.balanceB?.value?.balance === expectedB &&
    audited &&
    redeemed &&
    verified?.proofVerified &&
    verified?.contextVerified &&
    verified?.knownRootStatus &&
    verified?.nullifiersUnspent
      ? 0
      : 1;
}

// Allowlist admission as TroqPay runs it: the ASP admin inserts each account's
// leaf. On the first run, A's deposit is tried before admission and must be
// refused with aspNotReady.
async function admit(accounts, run, a) {
  const admitted = existsSync(ADMITTED_LEAVES_FILE) ? JSON.parse(readFileSync(ADMITTED_LEAVES_FILE, "utf8")) : {};
  const result = {};
  for (const account of accounts) {
    const leaf = (await run(account, "aspLeaf", account.address)).value?.leaf;
    if (!leaf) throw new Error(`${account.alias} has no ASP leaf`);
    if (admitted[leaf]) {
      result[account.alias] = "already admitted";
      continue;
    }
    if (account === a) result.depositBeforeAdmission = await run(a, "deposit", a.address, POOL, DEPOSIT);
    execFileSync(STELLAR_CLI, [
      "contract", "invoke", "--id", TROQPAY_DEPLOYMENT.asp_membership, "--source-account", ASP_ADMIN,
      "--network", "testnet", "--", "insert_leaf", "--leaf", BigInt(leaf).toString(),
    ], { stdio: ["ignore", "ignore", "pipe"] });
    admitted[leaf] = account.address;
    writeFileSync(ADMITTED_LEAVES_FILE, `${JSON.stringify(admitted, null, 2)}\n`);
    result[account.alias] = "admitted";
  }
  return result;
}

// The SDK gives each proof 30 s. On a cold browser the first proof of a
// circuit also loads and derives its proving key, which takes longer for the
// allowlist + blocklist + view key circuit; the worker keeps going and caches
// the prover, so a retry is fast.
async function retryColdProver(action) {
  let result;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    result = await action();
    const message = result.value?.message ?? result.error ?? "";
    if (!message.includes("timed out after")) return { ...result, attempts: attempt + 1 };
    await sleep(20_000);
  }
  return { ...result, attempts: 4 };
}

function cli(args) {
  return execFileSync(STELLAR_CLI, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// USDC per share, from the vault's own conversion (7 decimals).
function sharePrice(vault) {
  const [usdc] = JSON.parse(cli(["contract", "invoke", "--id", vault, "--source-account", "troqpay-hack",
    "--network", "testnet", "--send=no", "--", "get_asset_amounts_per_shares", "--vault_shares", "10000000"]));
  return (Number(usdc) / 1e7).toFixed(7);
}

// A buys vault shares with public USDC when it has fewer than the deposit.
function ensureVaultShares(account, needed) {
  const vault = YIELD_POOL.asset.contractId;
  const balance = () => BigInt(JSON.parse(cli(["contract", "invoke", "--id", vault, "--source-account", "troqpay-hack",
    "--network", "testnet", "--send=no", "--", "balance", "--id", account.address])));
  if (balance() < needed) {
    cli(["contract", "invoke", "--id", vault, "--source-account", account.alias, "--network", "testnet", "--",
      "deposit", "--amounts_desired", '["200000000"]', "--amounts_min", '["0"]', "--from", account.address, "--invest", "false"]);
  }
  return balance().toString();
}

// Classic balances come from the ledger entries as raw stroops.
async function publicAsset(address, code) {
  const { issuer } = TROQPAY_DEPLOYMENT.pools.find((pool) => pool.asset.code === code).asset;
  try {
    const trustline = await RPC.getTrustline(address, new Asset(code, issuer));
    return Number(trustline.balance().toBigInt()) / 1e7;
  } catch {
    return 0; // no trustline
  }
}

// Fresh admissions take a few ledgers to reach the RPC event stream.
async function depositOnceAdmitted(deposit) {
  let result;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    result = await deposit();
    if (result.value?.status !== "aspNotReady") return result;
    await sleep(6_000);
  }
  return result;
}

function loadIdentity(alias) {
  const secret = execFileSync(STELLAR_CLI, ["keys", "secret", alias], { encoding: "utf8" }).trim();
  const keypair = Keypair.fromSecret(secret);
  return { alias, keypair, address: keypair.publicKey() };
}

async function createEphemeralAccounts() {
  const accounts = [];
  for (const alias of ["privatepay-a", "privatepay-b"]) {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    let funded = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
      if (response.ok) {
        funded = true;
        break;
      }
      if (response.status !== 429) {
        throw new Error(`Friendbot refused ${alias} with HTTP ${response.status}`);
      }
      await sleep(5_000);
    }
    if (!funded) throw new Error(`Friendbot rate-limited ${alias}`);
    accounts.push({ alias, keypair, address });
  }
  return accounts;
}

async function launchSmokeBrowser() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath) return chromium.launch({ executablePath, headless: true });

  const configuredChannel = process.env.PLAYWRIGHT_CHANNEL;
  const channels = configuredChannel
    ? [configuredChannel]
    : process.platform === "win32"
      ? ["msedge", "chrome"]
      : ["chrome"];
  let lastError;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No supported Chromium browser was found. Install Chrome/Edge or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. ${
      lastError instanceof Error ? lastError.message : ""
    }`,
  );
}

async function openPage(context, search) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(BASE_URL + search);
  return { page, errors };
}

async function waitForReady(page) {
  const started = Date.now();
  let status = null;
  while (Date.now() - started < TIMEOUT_MS) {
    status = await page.evaluate(() => window.__privatepay ?? null);
    if (status && (status.stage === "error" || status.publicFeed !== null)) break;
    await sleep(2_000);
  }
  return { ...status, seconds: Math.round((Date.now() - started) / 1000) };
}

async function waitForBalance(read, expected) {
  let last;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    last = await read();
    if (last.value?.balance === expected) return last;
    await sleep(6_000);
  }
  return last;
}

async function timed(label, action) {
  const started = Date.now();
  try {
    const value = await action();
    return { seconds: Math.round((Date.now() - started) / 1000), value };
  } catch (error) {
    return { seconds: Math.round((Date.now() - started) / 1000), error: `${label}: ${error.message}` };
  }
}

function summarize(status) {
  return {
    stage: status?.stage ?? "unknown",
    error: status?.error ?? null,
    needsBootnode: status?.needsBootnode ?? null,
    publicFeedItems: Array.isArray(status?.publicFeed) ? status.publicFeed.length : null,
    seconds: status?.seconds ?? null,
  };
}

async function publicXlm(addresses) {
  const entries = await Promise.all(
    addresses.filter(Boolean).map(async (address) => {
      const account = await RPC.getAccountEntry(address);
      return [address, Number(account.balance().toBigInt()) / 1e7];
    }),
  );
  return Object.fromEntries(entries);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest();
}

function report(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await sleep(1_000);
  }
  throw new Error(`server did not start at ${BASE_URL}`);
}
