---
name: frontend-integration-guide
description: Generate clear, frontend-friendly integration guides for backend APIs, features, or services. This skill should be used when the user asks to document an API, create a frontend integration guide, write client-facing docs, or explain how to integrate a backend feature. Produces structured guides that help frontend developers and AI agents understand and implement backend integrations without needing backend knowledge.
---

# Frontend Integration Guide Generator

## Overview

Generate clear, structured integration guides that help frontend developers and AI agents understand and implement backend features without needing any backend knowledge. Each guide follows a consistent template that covers endpoints, request/response formats, error handling, state management, and UI/UX considerations.

## When to Use This Skill

- A user asks to "document this API" or "create a frontend guide for X"
- A user asks to "explain how to integrate" a backend feature
- A new endpoint, service, or feature is built and needs client-facing documentation
- A user asks to "make the docs clearer for frontend devs"
- A user mentions writing integration docs, client docs, or API docs

## Workflow

### Step 1: Identify the Scope

Determine what the guide covers. Ask the user if unclear:

- **Single endpoint**: One API route (e.g., "document the NIN submission endpoint")
- **Feature flow**: A multi-step user journey (e.g., "wallet funding flow" or "Google auth integration")
- **Full service**: An entire subsystem (e.g., "the bidding system" or "push notifications")

The scope determines how many endpoints and how much context the guide needs.

### Step 2: Gather Source Material

Read the relevant source code and existing documentation to extract:

1. **Route definitions** — Find the route file(s) for the feature. Look in `routes/` for endpoint paths, HTTP methods, and middleware.
2. **Controller logic** — Read the controller file(s) in `controllers/` to understand request validation, response shapes, and error cases.
3. **Model schemas** — Check `models/` for field types, required fields, enums, and defaults.
4. **Middleware** — Identify auth requirements (`protectUser`, `protectTasker`, `protectAdmin`, `requireKyc`, etc.).
5. **Existing docs** — Check `docs/` for any prior documentation on the feature.

Use `semantic_search` and `grep_search` to locate relevant files. Read them thoroughly before writing.

### Step 3: Read the Template

Read `references/guide-template.md` for the full template structure. Every guide must follow this template. The template defines:

- Section order and naming
- Table formats for parameters and errors
- Code example requirements
- Conditional sections (include only when relevant)

### Step 4: Read the Example Guide

Read `references/example-guide.md` for a complete, realistic example of what the output should look like. This demonstrates:

- The expected depth and detail level
- How to write for frontend developers (not backend devs)
- How to handle multi-step flows with diagrams
- How to format code examples for both web and React Native

### Step 5: Write the Guide

Produce the guide following the template structure. Key principles:

**Write for the frontend, not the backend:**
- Explain what the API does, not how it's implemented
- Use "the client" or "the frontend" — never "you" or "we"
- Never mention database schemas, middleware internals, or service layers
- Focus on what the frontend sends, receives, and displays

**Be concrete and complete:**
- Every field must have a type, required status, and description
- Every endpoint must have at least one code example (JavaScript fetch)
- Include React Native examples for file uploads, device permissions, or platform-specific APIs
- Use realistic example values, not `foo`, `bar`, or `...`
- Include all error cases the frontend must handle

**Structure for usability:**
- Use tables for parameters, responses, and error handling
- Include a flow diagram for any feature with more than one endpoint
- Add a "Frontend Implementation" subsection under each endpoint with copy-paste-ready code
- Include a testing checklist so developers can verify their integration

**Conditional sections — include when relevant:**
- **State Management**: Include when the feature spans multiple screens or requires caching
- **UI/UX Notes**: Include when there are non-obvious frontend behaviors (loading states, permissions, debouncing)
- **Common Integration Patterns**: Include when the feature has a multi-step user flow across screens

### Step 6: Save the Guide

Save the completed guide to `docs/` with a descriptive filename following the existing naming convention:

- Feature flow guides: `FEATURE_NAME_FRONTEND_INTEGRATION.md` (e.g., `WALLET_FUNDING_FRONTEND_INTEGRATION.md`)
- Single endpoint guides: `ENDPOINT_NAME_ENDPOINTS.md` (e.g., `NIN_VERIFICATION_ENDPOINTS.md`)
- Full service guides: `SERVICE_NAME_INTEGRATION.md` (e.g., `STELLAR_INTEGRATION.md`)

Check existing filenames in `docs/` to match the project's naming style.

## Resources

### references/guide-template.md
The canonical template structure for all frontend integration guides. Read this before writing any guide to ensure the output follows the correct format and includes all required sections.

### references/example-guide.md
A complete, realistic example guide (Wallet Funding) that demonstrates the expected quality, depth, and style. Read this to understand what "good" looks like before writing.

### assets/
No assets are bundled with this skill. The output is a Markdown document saved to the project's `docs/` directory.