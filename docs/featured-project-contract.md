# Single homepage featured project

Implemented on 2026-11-06 with explicit authorization to update the backend.

## Behavior

Projects has an icon-only outlined/filled star in grid and list views. Selecting
another project replaces the previous selection; manual ordering is independent.
The selected star cannot be deselected from this list. Buttons have accessible
names, tooltips, pending/disabled states, error feedback, and keyboard support.
The button is above the stretched card link and stops pointer events from
starting a card drag. The list reloads authoritative state after success or error.

The star can select only PUBLISHED/PUBLIC projects. Existing API support
for preparing a featured draft is retained: public APIs expose the selection only
when published, public, and not deleted. Archiving or changing visibility hides
the selected project publicly but retains its flag; deletion clears the flag.
When no featured project is publicly eligible, the existing homepage fallback
continues to apply.

The project editor only manages publication state and visibility in its publication
panel. Manual order and featured controls were removed, including their form
values: editor saves omit `sort_order` and `is_featured`, preserving the current
server values even if another session has changed them since the editor loaded.

## Contract and persistence

No new routes or dependencies. The list uses PATCH
`/api/v1/admin/projects/{project_id}` with `{ is_featured: true }`.
Create/update OpenAPI descriptions document atomic replacement, and TypeScript
contracts are regenerated with `npm run api:generate`.

Backend project writes acquire a transaction-scoped PostgreSQL advisory lock
before row locks. Creation/selection clears the old flag in the same transaction;
validation errors roll back the complete change. A partial unique index provides
a second enforcement layer for non-deleted projects.

Migration `0003_single_featured` retains the existing public hero where possible
(public/published first, then public endpoint ordering), clears other flags, and
creates the unique index. Downgrade removes the index; previous multiple flags
cannot be reconstructed. Applied to the local development database. Other
environments must run `python -m alembic upgrade head` from their backend venv.

## Changed files

Frontend: project-list.ts/html/scss, project-ui.spec.ts, generated API types,
and this document.

Backend: portfolio repository/service/models/schemas/transactions, migration
0003_single_featured, SQL/DBML design documents, migration test revision metadata,
project/public integration fixtures and tests, and test_featured_migration.py.

## Validation

- Frontend: 647 tests; lint, formatting, Angular typecheck, production build and
  SSR validation pass.
- Backend: 345 non-integration tests pass. Project/migration integration tests
  cover replacement, concurrent selection, rollback, public hero selection,
  deletion, existing-data cleanup, unique-index enforcement, and upgrade/downgrade.
  The final focused runs pass 10 project/migration tests and 6 public integration
  tests. Ruff, Ruff formatting and mypy pass for changed Python files.
- Chrome with intercepted fixtures: grid/list, real pointer click, Enter key,
  exclusive star state, no accidental navigation, and no horizontal overflow at
  390/768/1024/1440 pixels pass. Screenshots were inspected at desktop/mobile.
  Artifacts: `.tools/featured-1793943906561/` (local ignored files).
- No phase statuses changed; this is a scoped improvement to existing features.
