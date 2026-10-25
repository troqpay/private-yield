// DEMO-0 spike runner: opens the page in headless Edge with ?spike=1 and runs
// the spike in window.__demoSpike. The page creates its own disposable testnet
// accounts; no key leaves the browser and none is printed.
//   node scripts/spike-demo.mjs          public SPP XLM pool, no admission
//   node scripts/spike-demo.mjs --demo   the demo pools: the demo ASP admin
//     (Stellar CLI identity pyd-admin) admits both companies, and the demo
//     view key file audits the pool
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { xdr } from "@stellar/stellar-sdk";
import { chromium } from "playwright-core";

const BASE_URL = "http://localhost:5173/";
const DEMO = process.argv.includes("--demo");
const STELLAR_CLI =
  process.env.STELLAR_CLI ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\Stellar CLI\\stellar.exe" : "stellar");
const KEYS_DIR = process.env.PRIVATE_YIELD_KEYS_DIR ?? join(process.env.LOCALAPPDATA ?? homedir(), "troqpay-hackmeridian");

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: ["ignore", "pipe", "pipe"] });
vite.stderr.on("data", (chunk) => process.stderr.write(chunk));
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(BASE_URL)).ok) break;
    } catch {
      // Vite is still starting.
    }
    await sleep(1_000);
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 300));
  });
  // Every simulateTransaction the page (or its workers) sends: what the RPC
  // charges and why.
  const simulations = [];
  context.on("response", async (response) => {
    const body = response.request().postData();
    if (!body?.includes('"simulateTransaction"')) return;
    try {
      const { result = {} } = await response.json();
      let resources = null;
      if (result.transactionData) {
        const data = xdr.SorobanTransactionData.fromXDR(result.transactionData, "base64");
        const footprint = data.resources().footprint();
        resources = {
          resourceFee: data.resourceFee().toString(),
          readOnly: footprint.readOnly().length,
          readWrite: footprint.readWrite().length,
          instructions: data.resources().instructions(),
          diskReadBytes: data.resources().diskReadBytes(),
          writeBytes: data.resources().writeBytes(),
          kinds: [...footprint.readOnly(), ...footprint.readWrite()].map((key) => key.switch().name).join(","),
        };
      }
      simulations.push({
        minResourceFee: result.minResourceFee,
        error: result.error?.slice(0, 200),
        restorePreamble: result.restorePreamble ? result.restorePreamble.minResourceFee : null,
        resources,
      });
    } catch (error) {
      simulations.push({ unreadable: String(error).slice(0, 120) });
    }
  });
  await page.goto(`${BASE_URL}?spike=1${DEMO ? "&deployment=demo" : ""}`);
  await page.waitForFunction(() => Boolean(window.__demoSpike), null, { timeout: 60_000 });
  page.setDefaultTimeout(15 * 60_000);
  if (!DEMO) {
    const steps = await page.evaluate(() => window.__demoSpike.run());
    console.log(JSON.stringify({ steps, consoleErrors: errors.slice(0, 8) }, null, 2));
  } else {
    const setup = await page.evaluate(() => window.__demoSpike.setupDemo());
    const admission = {};
    if (setup.leaves) {
      const asp = JSON.parse(readFileSync("src/config/demo-testnet-deployments.json", "utf8")).asp_membership;
      for (const [name, leaf] of Object.entries(setup.leaves)) {
        execFileSync(STELLAR_CLI, ["contract", "invoke", "--id", asp, "--source-account", "pyd-admin", "--network", "testnet",
          "--", "insert_leaf", "--leaf", BigInt(leaf).toString()], { stdio: ["ignore", "ignore", "pipe"] });
        admission[name] = "admitted";
      }
    }
    const viewKey = JSON.parse(readFileSync(join(KEYS_DIR, "keys", "demo", "demo-gvk-d.json"), "utf8")).privateKey;
    const flow = setup.leaves ? await page.evaluate((key) => window.__demoSpike.protectAndPay(key), viewKey) : null;
    console.log(JSON.stringify({ setup: { steps: setup.steps, addresses: setup.addresses }, admission, flow, simulations, consoleErrors: errors.slice(0, 8) }, null, 2));
  }
} finally {
  await browser?.close();
  vite.kill();
}
