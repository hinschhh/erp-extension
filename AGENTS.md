# Repository Guidelines

## Project Structure & Module Organization
- `src/app`: Next.js App Router pages, layouts, and API routes; authenticated areas live under `(authenticated)/`.
- `src/components`: UI modules built with Ant Design/Refine, grouped by domain (e.g., `einkauf`, `lager`, `kundenberatung`).
- `src/providers`: Shared providers for auth, data, devtools, and i18n.
- `src/utils` and `src/types`: Cross-cutting helpers (Supabase client, formats) and shared DTO/status definitions.
- `supabase/functions`: Edge Functions for stock sync, BOM sync, and integrations; configured via `supabase/config.toml`.
- `public`: Static assets (icons, logos, manifest, service worker).

## Build, Test, and Development Commands
- `npm run dev`: Start the Refine/Next.js dev server (Node 22.x); hot reload enabled.
- `npm run build`: Production build for Next.js/Refine.
- `npm run lint`: ESLint via `next lint`; matches project style rules.
- Supabase functions: use `supabase functions serve <name>` locally and `supabase functions deploy <name>` for deployment (requires Supabase CLI).

## Coding Style & Naming Conventions
- TypeScript first; prefer functional React components with hooks.
- Indentation: 2 spaces, Prettier-like formatting enforced by Next/ESLint.
- Components/hooks: `PascalCase` for components, `useCamelCase` for hooks; utility modules `kebab-case` directories with `index.ts/tsx` entry points.
- Keep UI consistent with Ant Design patterns; reuse shared components before adding new ones.
- Organize side effects and API calls in providers/utils rather than components.

## Refine.dev Framework Patterns (MANDATORY)
**This project uses Refine.dev** - always follow these patterns for consistency and proper framework integration:

### Data Fetching & Mutations
- ✅ **Use Refine hooks**: `useForm`, `useTable`, `useSelect`, `useOne`, `useList`
- ✅ **Custom mutations**: Use `useCustomMutation()` instead of raw `fetch()` calls
- ✅ **Cache invalidation**: Use `useInvalidate()` instead of manual `refetch()`
- ❌ **Avoid**: Direct `fetch()` or axios calls in components (use for API routes only)

### Notifications
- ✅ Use Refine's built-in notification system via `successNotification` / `errorNotification`
- ❌ Avoid Ant Design's `message.success()` / `message.error()` directly in mutations

### Example: Custom File Upload
```typescript
const invalidate = useInvalidate();
const { mutate: uploadFile } = useCustomMutation();

const handleUpload = (file: File, fieldName: string) => {
  const formData = new FormData();
  formData.append("file", file);
  
  uploadFile(
    {
      url: "/api/custom-endpoint",
      method: "post",
      values: formData,
      successNotification: {
        message: "Upload erfolgreich",
        type: "success",
      },
      errorNotification: {
        message: "Upload fehlgeschlagen",
        type: "error",
      },
    },
    {
      onSuccess: (data) => {
        // Update form and invalidate cache
        form?.setFieldValue(fieldName, data.data.fileUrl);
        invalidate({
          resource: "resource_name",
          invalidates: ["detail"],
          id: recordId,
        });
      },
    }
  );
};
```

### Resource Names
- Match Supabase table/view names exactly (e.g., `app_purchase_orders`, `app_inbound_shipments`)
- Use views for read-only data, tables for mutations

## UI Guidelines for View and Edit Screens
**ERP / MES – Domain-Driven, Refine-based**

### Goal
Unified, understandable, and maintainable UI decisions for View screens, Edit screens, and Actions, based on the business role of a data object.

**Core Principle: Edit is for maintenance – View is for work – Actions replace Edit.**

### 1. Fundamental Decision: Type of Data Object
Every data object MUST be assigned to one of the following categories before implementing the UI.

### 2. Data Object Categories & Mandatory UI Rules

#### A. Master Data

**Description**
- Relatively stable
- Rare, deliberate changes
- Changes have potentially large impacts

**Examples**
- Product / Article
- Supplier
- Employee
- Article attributes

**UI Rules**
- ❌ No separate View screen
- ✅ Edit screen is the default
- ✅ Save / Cancel only visible when changes are made
- ✅ Sensitive fields (e.g., inventory, prices, critical parameters) not inline
  → separate form or modal

**Key Principle:** *Master data is maintained, not processed.*

#### B. Transactional & Workflow Data

**Description**
- Object goes through a status lifecycle
- Is "processed"
- Many readers, few editors

**Examples**
- Sales order
- Purchase order
- Production order
- Complaint

**UI Rules**
- ✅ View screen is the entry point
- ✅ Status, history, logs visible
- ✅ Business actions directly in the View (buttons)
- ⚠️ Edit screen only for metadata (date, note, assignment)
- ❌ No inline edits for core business logic

**Key Principle:** *Everything with status → View-first + Actions.*

#### C. Externally Managed State Data (External SSOT)

**Description**
- Data is displayed but not "owned"
- Source of truth lies outside (e.g., Billbee, Shopify)

**Examples**
- Inventory levels (SSOT: Billbee)
- Payment status
- Shipping status

**UI Rules**
- ✅ Exclusively read-only View
- ❌ No Edit screen
- ❌ No direct changes
- ✅ Changes only indirectly through business processes
  (e.g., inbound shipment, inventory count, correction posting)
- ✅ Clearly label the source ("managed by …")

**Key Principle:** *External SSOT → never edit directly.*

#### D. Operational Short-lived & Intermediate Data

**Description**
- Short-lived
- Operational
- Often one-time or person-specific

**Examples**
- Inbound shipment position
- Inventory count
- Time entry
- Production feedback

**UI Rules**
- ✅ Form-first
- ❌ No separate View screen necessary
- ✅ After saving: completion / return to list
- ⚠️ Corrections via new record, not Edit

**Key Principle:** *Operational data is captured, not managed.*

### 3. Decision Checklist (Mandatory)
Before any UI implementation, the following checklist MUST be considered:

1. **Does the object have a status lifecycle?**
   → Yes: View + Actions

2. **Is it master data?**
   → Yes: Edit-only

3. **Is the source of truth external?**
   → Yes: Read-only

4. **Is it actively "processed"?**
   → Yes: View-first

5. **Does a change have major business impact?**
   → Yes: explicit Edit form, no inline edit

### 4. Project-wide Guidelines
- No Edit screen without business justification
- No View screen without added value
- Status changes happen through Actions, not Edit forms
- Backend (Supabase) validates status changes and permissions
- Frontend displays state and triggers actions – no business logic

### 5. Quick Reference (for rapid decisions)
- **Master data** → Edit
- **Transactions** → View + Actions
- **External data** → Read-only
- **Operational data** → Form

## Testing Guidelines
- No automated test suite is defined yet; prioritize high-impact manual checks (auth flows, data mutations, critical edge functions).
- When adding tests, prefer integration-level coverage near pages/API routes; mirror file paths in a parallel `__tests__` or `tests` directory.
- Name tests after the behavior under test (e.g., `page.spec.ts`); keep fixtures under a colocated `__fixtures__` folder.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject lines (e.g., `Add supplier filter to inbound list`); group related changes together.
- PRs: include scope summary, linked issue/ticket, screenshots for UI changes, and steps to reproduce/verify. Call out breaking changes or new env vars.
- Ensure `npm run lint` (and any new tests) pass before opening a PR; keep diffs focused and domain-scoped.

## Security & Configuration Tips
- Keep Supabase keys and secrets in local `.env` files; never commit credentials. Ensure auth helpers remain server-safe (`auth-provider.server.ts`) for secure tokens.
- Validate external inputs in API routes (`src/app/api/**`) and prefer server-side Supabase calls to avoid exposing service roles client-side.

 ## Repository Guidelines
 **Supabase SQL note**: Files under `supabase/` mirror the hosted Supabase schema and are for read/reference. Apply changes via migrations against the online Supabase 
  instance; do not edit these files directly in local dev unless you also run the corresponding migration.

    Supabase sync: Any DB change applied in Supabase must be mirrored in the matching `supabase/<domain>/` SQL files (or      
  `supabase/allgemein/functions` for shared logic). I can’t sync these files myself—please copy your Supabase changes into  
  the repo to avoid drift 