# TaskHub x Stellar: Technical Integration Manifest

TaskHub utilizes the Stellar Network to provide low-cost, near-instant financial rails for a dual-sided marketplace. This document outlines our implementation of Stellar's decentralized ledger.

## 1. Architectural Implementation
* **Network:** Stellar Testnet (Phase 1) / Public (Phase 2)
* **SDK:** `stellar-sdk` (JavaScript/Node.js)
* **Conversion Layer:** Internal Real-time NGN/XLM Oracle (Fixed Rate: 1 XLM = 1500 NGN)

## 2. Core Features

### A. Non-Custodial Inbound Bridge (Deposits)
TaskHub implements a **Stellar Deposit Listener** that monitors the blockchain in real-time.
* **Mechanism:** The system listens to the Master Wallet (`GBEIY...`) via a Horizon stream.
* **Identification:** We utilize **Memo IDs** (64-bit unique alphanumeric) to map inbound transactions to specific User UUIDs.
* **Automation:** Upon payment detection, the listener validates the amount and automatically credits the User's Naira wallet in our MongoDB database.

### B. Automated Payout Engine (Withdrawals)
TaskHub automates the "Off-Ramp" process for Taskers.
* **Conversion:** The engine converts NGN balances to XLM based on the current platform rate.
* **Blockchain Execution:** The backend signs a `PaymentOperation` using the Master Secret Key and broadcasts it to the Horizon server.
* **Verification:** Every successful withdrawal saves a unique `blockchainTxId` (Transaction Hash) to the database as immutable proof of payment.

### C. Security & Trust
* **Transaction PINs:** Taskers must set a 4-digit hashed PIN (Bcrypt) to authorize any blockchain broadcast.
* **Atomic Updates:** We utilize MongoDB's `findOneAndUpdate` for idempotency, ensuring no payment is credited or debited more than once.
* **Transparency:** Users and Taskers receive real-time receipts containing links to the Stellar Expert explorer.

## 3. Key Endpoints for Review
* **Deposit Info:** `GET /api/wallet/stellar/deposit-info`
* **Request Payout:** `POST /api/wallet/withdraw`
* **Admin Approve:** `PATCH /api/admin/withdrawals/:id/approve`