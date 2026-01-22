# AI Development Contract (MANDATORY)

This repository follows a strict Domain-Driven, Refine-first, Supabase-centric architecture.

The AI assistant MUST prioritize:
1. Existing domain structure
2. Refine.dev patterns
3. Supabase as backend of truth (tables, constraints, RLS)
4. Reuse over creation
5. Stability over speed

⚠️ Generating monolithic components, bypassing Refine, or introducing
unnecessary backend layers is considered a violation of project architecture.

---

## Core Architecture Principles

- Backend (Supabase) is the source of truth
- Frontend (Refine) orchestrates user actions and displays state
- No business logic duplication
- Simple and stable over clever and complex
- MVP-friendly, but refactor-safe

---

## Architectural Decision Matrix (MANDATORY)

Before writing any code, ALWAYS classify the change:

### 1) Constraints (Database level)
Use when:
- data must NEVER be invalid
- rules must be enforced regardless of UI

Examples:
- NOT NULL, CHECK, UNIQUE, FOREIGN KEY
- value ranges, required relations

❗ Constraints are preferred over triggers.

---

### 2) Triggers (Database automation – LIMITED USE)

Triggers are ONLY allowed for:
- updated_at handling
- automatic numbering
- default values
- very small technical side-effects

❌ Triggers MUST NOT contain business logic  
❌ Triggers MUST NOT encode workflows

If logic is needed:
→ trigger calls a single, well-named function

---

### 3) Write-Flows (Frontend orchestration – ALLOWED)

A write-flow is a controlled sequence of database writes
triggered by a user action.

Examples:
- Header + items (replace-children pattern)
- Metadata updates
- Simple logging

Rules:
- Write-flows MUST live outside React components
- Use hooks or domain-specific helper modules
- UI components only trigger actions

Write-flows are acceptable for MVP speed
as long as invariants are protected by constraints/RLS.

---

### 4) RPCs (Supabase functions – SELECTIVE USE)

RPCs are used when:
- an action represents a single business command
- multiple rules must always be applied together
- logic must never be bypassed

Typical candidates:
- status transitions
- time tracking start/stop
- complex domain actions

RPCs are NOT mandatory everywhere.
They may replace write-flows when complexity increases.

---

### 5) Frontend (FE)

Frontend is responsible for:
- displaying data
- user interaction
- aggregation and summaries
- orchestration of actions

Rules:
- No business rules in components
- No assumptions about data validity
- Aggregations and sums are done in FE (no new DB views)

---

### 6) Integrations

- All background integrations are handled via n8n
- Supabase Edge Functions are NOT used
- No direct Supabase REST usage from UI

---

## Refine.dev Rules (STRICT)

Refine is NOT optional.

ALWAYS use:
- useTable, useList, useOne, useForm, useSelect
- useCustom / useCustomMutation for non-CRUD actions
- useInvalidate for cache invalidation

❌ DO NOT:
- use fetch or axios in components
- write custom API routes for CRUD
- implement business logic in React components
- bypass Refine resources

---

## Backend Rules (Supabase)

### Naming Conventions (MANDATORY)

Tables:
- app_<domain>_<entity>

Functions:
- fn_<domain>_<verb>_<object>   (commands)
- q_<domain>_<topic>            (queries)
- util_<topic>                  (pure helpers)

Trigger functions:
- trgfn_<table>__<event>__<purpose>

Triggers:
- trg_<table>__<event>__<purpose>

---

## External Source of Truth (Billbee)

Fields prefixed with `bb_` are managed externally.

Rules:
- bb_ fields are READ-ONLY
- MUST NOT be edited manually
- MUST NOT be used as internal state
- MUST NOT be renamed or repurposed

If internal state is required:
→ create a separate field WITHOUT bb_ prefix

---

## File Handling & Attachments (MANDATORY)

Files are NOT stored in Supabase.

### Source of Truth
- Microsoft SharePoint
- Base path: `/00 WebApp/`

Structure:
00 WebApp/
  <domain>/
    <subfolders>/
    files

Rules:
- Supabase stores only file references and metadata
- No binary data in the database
- No Supabase Storage
- No third-party file services

Frontend:
- uploads via custom API routes
- triggered via useCustomMutation

---

## Database Views Policy (STRICT)

This project NO LONGER introduces new database views.

Reasons:
- data volume does not require them
- views-on-views caused coupling and stress
- debugging and refactoring became harder

Rules:
- ❌ No new views
- ❌ No views on views
- ❌ No refactors into views for convenience

Existing views are legacy and MUST NOT be extended.

---

## Breaking Changes Policy (MANDATORY)

Breaking changes are a major stress and risk factor.

### Breaking changes include:
- renaming columns
- dropping columns or tables
- removing views
- changing function signatures
- deleting triggers
- modifying enums or status values

### REQUIRED workflow: Expand → Switch → Remove

1) EXPAND  
   Add new structure (column, function, table)

2) SWITCH  
   Update all usages:
   - frontend (resources, hooks, filters)
   - backend (functions, triggers, policies)

3) REMOVE  
   Only then remove the old structure

❌ NEVER:
- rename or drop directly
- assume something is unused
- apply breaking changes without impact analysis

Before applying a breaking change, the AI MUST:
- list affected frontend files
- list affected DB objects
- propose a safe step-by-step migration plan

Stability is preferred over speed.

---

## Documentation Rules

Documentation lives close to the code.

For every domain change:
- update `supabase/domains/<domain>/README.md`

Minimum required:
- purpose
- affected tables
- rules/invariants
- new or changed actions (write-flows or RPCs)

Documentation should be short, honest, and practical.

---

## Definition of Done – Backend Changes

A backend change is NOT done unless:
- constraints/RLS are considered
- naming conventions are followed
- breaking-change policy is respected
- domain README is updated if behavior changed

---

## Final Rule

If unsure where logic belongs:
→ prefer constraints
→ then write-flow
→ then RPC
→ never trigger-heavy logic
