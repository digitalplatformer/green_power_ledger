# Green Power Ledger(GRPL)

# Overview

**Green Power Ledger (GRPL)** is a blockchain-based infrastructure that enables time-accurate traceability of renewable electricity by tokenizing its environmental value as an on-chain Real World Asset (RWA).

By combining Granular Certificates with the XRP Ledger (XRPL), GRPL transforms renewable generation into a verifiable and transferable digital asset.

---

## Problem

Existing renewable certificate systems (e.g., Japan’s Non-Fossil Certificates) face structural limitations:

- **Coarse granularity** — Certificates aggregate electricity across broad time periods
- **Limited time-matching** — Difficult to align generation with actual consumption
- **Fragmented standards** — Inconsistent frameworks across jurisdictions
- **Restricted transparency** — Limited public verifiability and auditability

These constraints prevent precise, time-accurate traceability of green electricity.

---

## Solution

GRPL leverages **Granular Certificates (GC)** — an emerging international standard for 24/7 time-matched renewable accounting — and manages them on XRPL as Multi-Purpose Tokens (MPTs).

- **Fine-grained representation** — Each GC corresponds to a specific hour of renewable generation, subdivided into smaller units (e.g., 1 kWh)
- **On-chain asset layer** — GCs are issued, transferred, and clawed back as MPTs on XRPL
- **Fast finality & low cost** — Supports high-frequency, small-unit transactions
- **Transparent lifecycle** — Publicly verifiable issuance, transfer, and consumption settlement
- **Geographic metadata** — Enables spatially-aware renewable matching, encouraging local consumption and reducing transmission distance and associated energy losses

By converting time-matched renewable generation into a programmable RWA, GRPL establishes a foundational ledger for peer-to-peer energy exchange, enhanced ESG verification, and future green financial markets.

## Market

Renewable energy already represents a massive and growing market.

- **Japan** generates approximately **230 TWh** of renewable electricity annually.
  At an average price of around **¥25 per kWh**, this corresponds to an annual market size of roughly:

  $$230 \times 10^{9} \text{ kWh} \times 25 \text{ yen} \approx 5.75 \text{ trillion yen}$$

- **Globally**, renewable generation exceeds **10,000 TWh** per year, representing a multi-trillion-dollar energy market.

As corporate decarbonization commitments tighten and regulators increasingly demand higher-quality renewable claims (e.g., time-matching and traceability), the demand for granular, verifiable green energy assets is expected to grow significantly within this already large market.



# MPT Utilization (XRPL-native workflow)

This project handles XRPL Multi-Purpose Tokens (MPTs) using the standard XRPL transaction types defined in the official documentation. Each high-level operation (mint, transfer, burn) is composed of one or more XRPL transactions to ensure explicit authorization, clear ownership transitions, and proper lifecycle management of the tokenized Granular Certificates (GCs).

## Mint (3 steps)
1. **MPTIssuanceCreate** — Create a new MPT issuance representing a GC.
2. **MPTTokenAuthorize (User)** — User approves receiving this MPT.
3. **Payment (with MPT)** — Issuer sends the MPT to the user.

## Transfer (2 steps)
1. **MPTTokenAuthorize (Receiver)** — Receiver approves accepting the MPT.
2. **Payment (with MPT)** — Current holder transfers the MPT to the receiver.

## Burn (1 step)
1. **Clawback** — Issuer recalls the MPT to invalidate or burn it.


### Current Implementation (PoC)

In the current proof-of-concept stage, all user accounts are managed by the administrator/operator side rather than being fully self-custodial. This simplifies coordination and testing while validating the core MPT workflow.

**Future Work**: Transition to user-managed (self-custodial) wallets where users control their own private keys.


# Setup

## Prerequisites

- **Bun** 1.x+
- **Docker** / Docker Compose
- **PostgreSQL** client (optional)

## Installation

```bash
# Install dependencies
bun install

# Setup environment variables
cp .env.example .env
# Edit .env and fill in required values:
#   - ENCRYPTION_MASTER_KEY: openssl rand -hex 32
#   - ISSUER_SEED: Your XRPL testnet issuer wallet seed
```

## Start Services

```bash
# Start PostgreSQL
docker compose up -d

# Run migrations
bun run migrate up

# Start server
bun run dev
```

Server runs at `http://localhost:3005`


# API

For detailed API specifications, see [docs/openapi.yaml](./docs/openapi.yaml).

## Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/operations/mint` | Issue new MPT and distribute to user |
| POST | `/api/operations/transfer` | Transfer MPT between users |
| POST | `/api/operations/burn` | Clawback MPT from holder (issuer only) |
| GET | `/api/operations/{id}` | Get operation status (detailed) |
| GET | `/api/operations/{id}?status=true` | Get operation status (lightweight) |

## Wallets

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/wallets` | Create new user wallet |
| GET | `/api/wallets/{id}` | Get wallet information |
| POST | `/api/wallets/{id}/fund` | Fund wallet from faucet (testnet only) |


# Logo
![](./logo.png)