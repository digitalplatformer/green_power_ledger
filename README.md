# Green Power Ledger(GRPL)

# Overview

Green Power Ledger (GRPL) is a blockchain-based infrastructure that brings real-time traceability and verifiability to green electricity by representing its environmental value as an on-chain Real World Asset (RWA). As demand for renewable energy continues to grow, existing certificate systems—such as Japan’s Non-Fossil Certificates—remain limited by coarse granularity, lack of real-time matching, and insufficient international standardization, making it difficult to reliably prove when and where green electricity is actually consumed.

GRPL addresses these challenges by leveraging Granular Certificates (GC), an emerging international standard that enables 24/7, time-matched accounting of renewable energy. Each GC represents one hour of electricity generation and contains smaller bundles (e.g., 1 kWh units), allowing precise alignment between supply and demand. These certificates are tokenized as Multi-Purpose Tokens (MPTs) on the XRPL, providing transparent, tamper-resistant, and publicly auditable traceability.

Built-in features such as expiration and clawback ensure proper lifecycle management and compliance, while embedded metadata—such as generation location—enables localized, lower-loss energy trading. By turning high-quality, time-accurate green electricity into a programmable RWA, GRPL establishes a foundational ledger for peer-to-peer energy exchange, enhanced ESG reporting, and future green finance applications, ultimately advancing a more transparent and sustainable energy system.

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

# Logo
![](./logo.png)