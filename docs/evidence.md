# Evidence (Stellar Testnet)

Everything below is on testnet with test assets. Open a transaction at
`https://stellar.expert/explorer/testnet/tx/<hash>`. This evidence set validates
the HackMeridian delivery. The complete TroqPay integration, evaluator,
cross-company end-to-end tests and final evidence were completed during the
event. Contract deployment timestamps identify the testnet resources used by
the build; they are not the delivery date of the product experience.

## Contracts

| Contract | Address |
|---|---|
| DeFindex vault `tyUSDC` (factory-created, not upgradable, fee 20%) | `CANERND5MTY6QZN6FBDNY4TAMIIEKMYO4MCGLFESIY5O7XF6ILUDWANB` |
| Private Yield pool (vault shares) | `CBVVA7LJ6PJ2CG47RA4JLKERHUVO56AAIT4DLTBLDWZVABM3GW267A24` |
| USDC pool | `CBTQLK7WK7ORVVZFWUDLMQRO4QMXSXZLSHUCIRNNAV6BZ4JQVSEHVXB7` |
| EURC pool | `CAU2D6CMNTHLZJWJFMQXV7ILGC5D4ZHJSAEIYZPMETGMNREFP3DOXLY7` |
| ASP membership (allowlist) | `CBPKURLVHPRJOC5ISVXBMR2AFHUWVPGN4U35AVL3N66PXNC4C5ODDIYW` |
| ASP non-membership (blocklist) | `CAEDGUJQQZDQWIBMHQNZ3OJPWQ7PS2HRYYTOLD7XELZDZZMH7KA4ONDT` |
| Public key registry | `CB7OTVIGKXIYL4ZFX3M7NULT5LV7OQ4W4XDKBK2FBKUBREFT4PULZLHK` |
| Groth16 verifier `AB_gvk_T` | `CDYQPZ4OKEK23E4NZATY4KTX74A3CKRLJUZWN726JEUHDHICGFJUZOEB` |
| DeFindex factory (testnet) | `CDSCWE4GLNBYYTES2OCYDFQA2LLY4RBIAX6ZI32VSUXD7GO6HRPO4A32` |

## What was proven

| # | Proof | Transactions |
|---|---|---|
| 1 | Private payment and view-key audit on the USDC pool (allowlist enforced before admission) | deposit `79a6bc439b87778d6a66dea3b8a970b7d80536473c51da299b4af844f7000bd7`, payment `ffcd6ff45b9a3f849bf11c34820370dfcee934a023d62780ba80c3a70c5d3f68` |
| 2 | A Privy wallet with no XLM registers and deposits; the sponsor pays every fee | registration `c444ac68ac8a97b9ae6f4b6b32ef784fd2fe1916affa8e9dac9565abe106e625`, deposit `c3e147278613b9974414e4356e425cef579dd03cdd5f8a2c066d2dbb3364eeeb` |
| 3 | Yield inside the pool: entry, private payment, share price 1.0 → 1.1 (simulated), 4 shares redeemed for 4.40 USDC | entry `87cf5a9e8715f0f8cd8f2982efe64d8fc359be94cd3e402cd24f5d62420c94cd`, payment `5354df006ddd5cee4d2424080f9f01ce497f25d460fac32be120f7d3ff51a4bd`, redemption `979de93d31b4918217fd31f24114be7babb4c685b8386ef2eb2a352f6924127b` |
| 4 | **Automatic private payment from the TroqPay app's Send screen**: 5 USDC, one confirmation | vault entry (90 USDC) `cacc69641051308ea54d8711482355e9d2c6789c747ae3e29197a78059601380`, shares into the pool `f487336be0a90b9d94722697d1421a7c99798ecb0920a3548fc7ab87fc83b60f`, **private payment `984db58719993719418c35f61394b856659a8c4973f7db01c9be4f84de7b789c`** |
| 5 | Vault performance fee set to 20% (`get_fees` = `[2000, 2000]`) | `41f1ee0e7e72c899051ede45af3160c505dccc2a73c3111bf206417a8b624842` |
| 6 | Payer identified with Stellar RPC only: `getEvents` on the pools in the note's ledger (5351653), then `getTransaction` → the payer's wallet inside the fee bump | the payment of row 4 |
| 7 | Private payment of 1 share from a test identity to the app's company; the RPC payer lookup returns that identity | `17bd5d7096e28682589a85719d2ff8448446c4ea07757f43568246fef359ffaf` |

Receipts for these payments verify with four checks: valid proof; recipient,
purpose and code match; payment recorded in the pool; and whether the amount
was spent yet.

[`receipt-example.json`](receipt-example.json) is one such receipt: a 4-share
payment on the Private Yield pool, disclosed to "TroqPay Compliance (demo)".
Paste it into the verifier, or open it pre-filled
[here](https://troqpay-app-stellar-testnet.up.railway.app/privatepay/verify#r=eyJ2ZXJzaW9uIjoxLCJjaXJjdWl0Ijp7Im5hbWUiOiJzZWxlY3RpdmVEaXNjbG9zdXJlXzEiLCJsZXZlbHMiOjIwLCJuTm90ZXMiOjEsInZrSGFzaCI6IjB4NmZjMTFlMjgxYTc0OTYzOTc2MmRmNzIwNDUwYmUxMTgyMDUxYzkzZDgzZTZjZmYzNjI0ODg5NjUwOGQ4NWVlMiJ9LCJjb250ZXh0Ijp7Im5ldHdvcmsiOiJ0ZXN0bmV0IiwicG9vbEFkZHJlc3MiOiJDQlZWQTdMSjZQSjJDRzQ3UkE0SkxLRVJIVVZPNTZBQUlUNERMVEJMRFdaVkFCTTNHVzI2N0EyNCIsImF1dGhvcml0eUxhYmVsIjoiVHJvcVBheSBDb21wbGlhbmNlIChkZW1vKSIsImF1dGhvcml0eUlkZW50aXR5UGF5bG9hZEhleCI6IjB4NDJlMDEyN2U3ZWEwMjgwOTk5NzRkOTU5ZjA1ZDcxMmEiLCJwdXJwb3NlIjoiYjJiLXBheW1lbnQtZXZpZGVuY2UiLCJjb250ZXh0Tm9uY2UiOiIweDExNjZmYWMxODA4MDFhYjMxZDhiZTZhYzUwNDRmMjcwY2RhMjBmMzdlZGFlNDc1MTg1ODg4NzlmMmI4OTMwMjYifSwicHVibGljSW5wdXRzIjp7InJvb3RzIjpbIjB4MjUxOTRkZDhkNTNiY2ZkZGJiZWZmZDNmMzE0MTNkZDczYTg0NTk1YjJlMzAwYjgzMGM1NjY4MDM1MGI5ZmVjOSJdLCJub3RlQ29tbWl0bWVudHMiOlsiMHgyMWNkODQ3YzAyMTZlYjdiNzMwYjg1NTkyMDJmNjRjYjRjOWFmZGYxZmYzYWU5ZmQ1Mjc0ZGM5NzA3YzY5MWM1Il0sImV4dENvbnRleHRIYXNoIjoiMHgxMWZiYTQ2MDk3NjA2NGNkZWFiYWMwMjg0MGUyNDNkZWYwNTk0NDdlNDhmOTk2Y2M3NzI0ZmFkOTMzNDdmZGZiIiwibnVsbGlmaWVycyI6WyIweDIzMGNkODc4NDI5NTQ5MjVkZDVmMjU2OWE2YTViMGVlMDRkNWJhN2FiNDEwYTVjZDJkMzAyYjhlMDQ3N2NiZTUiXSwiYW1vdW50cyI6WyI0MDAwMDAwMCJdfSwicHJvb2ZDb21wcmVzc2VkSGV4IjoiMHg1MGU0ZTk2OGM5ODU5MDEzNmU0NGJjOTdmMjFmYjI0ZDRkMTMwNjljOWE5M2YyOTlkOGQyYzBkMWJjNTEwOWFmMzNkMzlhMDRhNWQwNjVjNzI1MTk3NjM3ZmUxM2I2YzgzOTQwNDA5ZDdlY2Y1ZTZhNWU4NmM1YTgxM2U1YTkyYzA5ZjEwMzJjNzQxYmQ5MzU4YmRhNmNhMzg5NDUxZWMzYzAyOGVhYmRjM2JkMjY5NTI3Y2U3NzYwYjBlYWFlOTc3YmRjYjZlNzE4NTM4Zjk2MzBhMjRhNTdmMjlmMDc2NmIyYzhmNjA0Yjc1MDBiNTc1Njk2MTQ4NTYzNjFjNzA3IiwiaXNzdWVkQXQiOiIyMDI2LTEwLTIzVDE3OjA0OjIzWiJ9). It reveals that one payment and nothing else about the account.

## What the public sees in row 4

| Transaction | Visible |
|---|---|
| `cacc6964…` | The company put 90 USDC into the vault |
| `f487336b…` | The company put shares into the pool |
| `984db587…` | Only that the company's wallet called the pool: no recipient, no amount |

The view key decrypts the same payment: the recipient received 4.5454546
shares (5.00 USDC at 1.1) and the payer kept 77.27 shares as change.

## HackMeridian product integration, 25–26 October 2026

A newly onboarded US company, `Global Demo Ltd`, received 20 test USDC,
activated Private Yield and paid an existing TroqPay company 2 test USDC from
the normal Send flow.

| Step | Transaction | Result |
|---|---|---|
| Public test USDC funding | `67abf12fbc1c6c5de3e0faf68858d1bd7563781cbeb13f00917c5355e2bef2e1` | 20 test USDC arrived in the new Global Account |
| Move into the protected balance | `eec84219e71a1b08824d367524590bcb7e30664da132ea813586799c9455d105` | the account showed 20 test USDC in Private Yield |
| Private payment | `88363ba321522aabbfe380e03c170e4d20d9e8e5c1e215385a8cf710cd5b6bd1` | successful in ledger `5,391,271`; sponsor paid the fee; TroqPay showed 18 test USDC remaining |
| Self-contained evaluator smoke | deposit `2f70ef0809f22c38b37e731b9f64b732c479b63515d64b7da81b1bdbfc022812`, payment `169f813a161ebd3eb3ee9139f650b4158ab043f777f826e044c5d67683610adc` | disposable Friendbot accounts completed registration, deposit, private payment, receipt and all four verification checks without local identities or secrets |

The Etherfuse approval used by this onboarding was simulated only for the
HackMeridian testnet environment. Wallet creation, trustline, funding, vault
and pool calls, private payment and chain verification were real testnet
operations.
