# Agent Instructions: User Details Enrichment

## Context
We have a project with **Task Management**, **Task Details**, and a **Conversation API**.

## Current State
- The Conversation API/endpoints already contain fields for: **earning amount (spending range)**, **total number of tasks**, and **trust score**.
- These fields exist at the conversation level but are **missing from the User Task Details** panel/section.

## Requirements

### 1. Task Details → User Details Section
Inside the **Task Details** view, locate the nested **User Details** subsection and add the following fields:
- **Spending Range / Earning Amount**: The amount the user earns or their spending range.
- **Total Number of Tasks**: The user's total task count.
- **Trust Score**: A calculated metric representing user reliability.

### 2. Trust Score Logic
Implement a trust score based on task completion ratio:
- Formula should compare completed tasks vs open tasks.
- Example: 30 open tasks and 2 completed tasks = very low trust score.
- Higher completion ratio = higher trust score.
- Recommended: `(completedTasks / totalTasks) * 100`, clamped `0–100`. If total is 0, default to 0 or neutral.

### 3. Universal Inclusion
**Any API endpoint, response model, or UI component that returns/sends user details must include these fields natively.**
Do not limit this to one screen or endpoint. The goal: wherever user details appear later, the data is already there and can be picked up directly.

### 4. User Task Details Sync
The fields above already exist in the Conversation API endpoints. You must also expose these same fields in the **User Task Details** view/API response so both sections are consistent.

## Action Items
- [ ] Update the core **User / UserDetails entity/model** to include `spendingRange`, `totalTasks`, and `trustScore`.
- [ ] Implement `trustScore` calculation logic in the backend (server-side).
- [ ] Update all API endpoints / DTOs / serializers that expose user details to return the enriched object.
- [ ] Ensure **User Task Details** and **Conversation API** (and any other views) all consume the same enriched user-details source.
- [ ] Refactor if necessary so there is a **single source of truth** for user details rather than ad-hoc additions per endpoint.
