# MPT Operation Flow Sequence Diagrams (XRPL Transactions)

This document shows the flow of transactions executed on XRPL.

## 1. Mint Operation

```mermaid
sequenceDiagram
    participant Issuer as Issuer Wallet
    participant XRPL as XRPL Ledger
    participant User as User Wallet

    Note over Issuer,User: Step 1: Issue MPT

    Issuer->>XRPL: MPTokenIssuanceCreate<br/>Flags: CanTransfer, CanClawback
    XRPL-->>Issuer: ✓ create MPT Issuance<br/>IssuanceID: 00D2D0...

    Note over Issuer,User: Step 2: Authorize

    User->>XRPL: MPTokenAuthorize<br/>MPTokenIssuanceID: 00D2D0...
    XRPL-->>User: ✓ authorize MPT

    Note over Issuer,User: Step 3: mint MPT

    Issuer->>XRPL: Destination: User<br/>Amount: {mpt_issuance_id, value: 1000}
    XRPL-->>User: ✓ MPT received<br/>(User Balance: 1000)

    Note over Issuer,User: Complete Mint
```

## 2. Transfer Operation

```mermaid
sequenceDiagram
    participant Sender as Sender Wallet
    participant XRPL as XRPL Ledger
    participant Receiver as Receiver Wallet

    Note over Sender,Receiver: Step 1: Authorize MPT

    Receiver->>XRPL: MPTokenAuthorize<br/>MPTokenIssuanceID: 00D2D0...
    XRPL-->>Receiver: ✓ Authorize MPT

    Note over Sender,Receiver: Step 2: transfer MPT

    Sender->>XRPL: Destination: Receiver<br/>Amount: {mpt_issuance_id, value: 1000}
    XRPL-->>Receiver: ✓ receive MPT<br/>(Receiver balance: +1000)
    XRPL-->>Sender: (Sender balance: -1000)

    Note over Sender,Receiver: Complete Transfer
```

## 3. Burn Operation (Clawback)

```mermaid
sequenceDiagram
    participant Issuer as Issuer Wallet
    participant XRPL as XRPL Ledger
    participant Holder as Holder Wallet

    Note over Issuer,Holder: Step 1: Clawback

    Issuer->>XRPL: Clawback<br/>Holder: Holder Address<br/>Amount: {mpt_issuance_id, value: 300}
    XRPL-->>Holder: (Holder balance: -300)
    XRPL-->>Issuer: ✓ Clawback MPT

    Note over Issuer,Holder: Complete Clawback
```

## Transaction Details

### Mint Operation Transactions
1. **MPTokenIssuanceCreate** - Creates MPT issuance settings
   - `AssetScale`: Decimal places (fixed to 0)
   - `MaximumAmount`: Maximum supply (same as mint amount)
   - `TransferFee`: Transfer fee (fixed to 0)
   - `Flags`: `CanTransfer` (transferable) + `CanClawback` (clawback enabled)

2. **MPTokenAuthorize** - User authorizes MPT receipt
   - Creates MPToken object (prepares for receipt)

3. **Payment** - Sends MPT from Issuer to User
   - `Amount`: `{mpt_issuance_id: "...", value: "1000"}`

### Transfer Operation Transactions
1. **MPTokenAuthorize** - Receiver authorizes receipt
2. **Payment** - Sends MPT from Sender to Receiver

### Burn Operation Transactions
1. **Clawback** - Issuer forcibly retrieves MPT from Holder
   - Only Issuer can execute Clawback
   - Forcibly retrieves without Holder's approval
