# TaskHub Backend Services

## Purpose
This repository contains the core backend services that power the entire TaskHub platform. It serves as the single source of truth for business logic, data management, and platform operations.

## Stellar Network Integration
TaskHub is built on the **Stellar Network** to provide low-cost, near-instant financial rails. We leverage Stellar for:
- **Non-Custodial Bridges:** Automated NGN-to-XLM inbound payment detection.
- **Automated Payouts:** Instant blockchain off-ramping for Taskers.
- **Transparency:** Immutable transaction receipts and real-time explorer tracking.

---

## What the Backend Does
- **Financial Infrastructure:** Manages multi-currency wallets (NGN/XLM), escrow handling, and automated blockchain listeners.
- **User Management:** Handles distinct account roles for Users (Clients) and Taskers (Freelancers).
- **Marketplace Logic:** Orchestrates task creation, bidding systems, and real-time job lifecycles.
- **Identity & Security:** Manages KYC verification, transaction PIN security, and Role-Based Access Control (RBAC).

## Core Responsibilities
- **Business Logic:** Centralized rules and data validations.
- **Data Integrity:** Secure persistence using MongoDB with atomic transaction handling.
- **Real-time Notifications:** Web-push, In-app alerts, and Email receipts via OneSignal and Resend.

## Connected Products
- **Company Website** (Marketing & SEO)
- **Web Application** (Primary User/Tasker Interface)
- **Mobile Application** (On-the-go Task Management)
- **Admin Dashboard** (Operations, Moderation & Financial Payouts)

## Architectural Principles
- **Scalability:** Modular service-oriented architecture.
- **Security by Default:** Hashed sensitive data (Bcrypt) and secure environment management.
- **Blockchain Synergy:** Seamlessly bridging traditional Fiat (Paystack) with Web3 (Stellar).

---

## Technical Stack
- **Runtime:** Node.js (ES Modules)
- **Database:** MongoDB (Mongoose ODM)
- **Blockchain:** Stellar SDK
- **Communication:** OneSignal (Push), Resend (Email), Socket.io (Planned)

