# Spotlight Search & Todo Desktop Application

## Apple Liquid Glass UI — Phased Implementation Plan

## Project Goal

Build a polished, keyboard-first desktop application that combines:

1. A Spotlight-style local file search experience.
2. High-performance offline file and folder indexing.
3. A built-in Todo and Notes workspace.
4. Apple-inspired Liquid Glass UI, motion, and interaction design.
5. Fully portable packaging that works without installation or administrator access.

The application must preserve all existing functionality, data, settings, and business logic. It must work completely offline after packaging.

---

# Global Implementation Rules

Apply these rules throughout every phase:

* Do not require administrator privileges.
* Do not install Windows services, drivers, shell extensions, or global dependencies.
* Do not depend on an internet connection at runtime.
* Do not index Windows system directories or application installation directories.
* Search only within approved user-owned directories.
* Never replace functional features with mock UI.
* Keep file indexing, search logic, persistence, UI, and Todo business logic separated.
* Every visible control must be functional.
* Use reusable components and centralized design tokens.
* Support keyboard navigation, screen readers, reduced motion, reduced transparency, and high contrast.
* Preserve stored paths and Todo data between application launches.
* Do not stop after implementing only the main screen.
* Run build, lint, type-check, tests, packaging, and portable runtime validation before declaring completion.
* Record unresolved issues explicitly instead of hiding or suppressing them.

---

# Recommended Technology Architecture

Use the existing project stack when practical. If the project does not yet have a suitable architecture, use the following:

## Desktop Runtime

* Electron
* React
* TypeScript
* Vite or electron-vite
* Node.js filesystem APIs
* Electron IPC with strict context isolation

Electron is appropriate because it provides:

* Offline desktop execution.
* Direct filesystem access through the main process.
* Portable Windows packaging.
* Native file-opening and Explorer integration.
* Background indexing using Node.js worker threads.
* No requirement for administrator access.

Do not expose Node.js APIs directly to the renderer.

## Data Storage

Use SQLite as the primary local database.

Recommended features:

* SQLite WAL mode.
* FTS5 virtual tables for file-name and path searching.
* Prepared statements.
* Batched transactions.
* Indexed normalized-path, parent-path, extension, type, and timestamp columns.
* Migration support.
* Graceful corruption recovery.
* Database stored inside the portable application data directory.

Recommended database library:

* `better-sqlite3`, when compatible with the project packaging setup.
* Otherwise use a maintained SQLite package that supports FTS5 and packaged desktop execution.

## File Indexing

Use:

* Node.js `fs.promises.opendir`.
* A bounded asynchronous traversal queue.
* Worker threads for metadata processing when beneficial.
* Batched database writes.
* Incremental synchronization based on stored path, modified time, size, and type.
* Optional filesystem watching only for approved user directories.

Do not use:

* Windows Search as the only indexing source.
* The Everything service.
* Administrator-only USN Journal access.
* A Windows background service.
* Full file-content indexing during the initial implementation.

## UI

Use:

* React component architecture.
* CSS variables for design tokens.
* Framer Motion or an equivalent lightweight motion system.
* A single consistent rounded line-icon library.
* Virtualized result lists for large result sets.

## Packaging

Support:

* Windows portable executable.
* Per-user Windows setup executable.
* Unpacked portable directory for validation.
* Separate self-signed private-use output for personally controlled machines, with only the public trust certificate exported.
* User-writable local data directory.
* Bundled SQLite native dependencies.
* Bundled runtime assets.
* No external installer requirement.

---

# Approved Scan Scope

The initial automatic scan must search user-owned content only.

Include configurable locations such as:

* Desktop
* Documents
* Downloads
* Pictures
* Videos
* Music
* User-created folders
* Optional additional folders selected by the user

Exclude by default:

* `C:\Windows`
* `C:\Program Files`
* `C:\Program Files (x86)`
* ProgramData
* Recycle Bin
* Temporary system directories
* Application caches
* Browser caches
* Node modules
* Git internals
* Hidden operating-system directories
* Any directory for which access is denied
* The application’s own packaged runtime and cache directories

Do not fail the scan because one directory is inaccessible. Record the skipped path and continue safely.

---

# Phase 0 — Repository Assessment and Implementation Baseline

## Prompt

You are responsible for preparing the Spotlight Search and Todo desktop application for a complete Apple Liquid Glass redesign and offline indexing implementation.

Before changing functionality:

1. Inspect the repository structure.
2. Identify:

   * Desktop runtime and framework.
   * Renderer architecture.
   * Existing search functionality.
   * Existing Todo functionality.
   * Current persistence mechanism.
   * Existing packaging scripts.
   * Existing themes and design tokens.
   * Current tests and validation scripts.
3. Trace all existing data flows and IPC boundaries.
4. Identify any direct filesystem access from the renderer.
5. Identify all features that must be preserved.
6. Document the current application state.
7. Create or update an implementation checklist for all phases in this plan.
8. Establish baseline results for:

   * Build
   * Lint
   * Type-check
   * Unit tests
   * Integration tests
   * Packaging
9. Do not redesign or rewrite working business logic before understanding it.

### Deliverables

* Architecture summary.
* Existing-feature inventory.
* Risk list.
* Current data-storage assessment.
* Current packaging assessment.
* Baseline test report.
* File-by-file implementation plan.

### Exit Criteria

* The application architecture is understood.
* Existing behavior is documented.
* Baseline failures are separated from new regressions.
* No functionality has been silently removed.

---

# Phase 1 — Centralized Apple Liquid Glass Design System

## Prompt

Implement a complete Apple-inspired Liquid Glass design system for the Spotlight Search and Todo desktop application.

Do not merely add backdrop blur. Rebuild the visual hierarchy, reusable surfaces, spacing, typography, interaction states, and motion as one coherent system.

## Design Requirements

Create centralized tokens for:

* Glass surface colors.
* Light and dark themes.
* Borders.
* Inner highlights.
* Shadows.
* Blur and saturation.
* Text colors.
* Accent colors.
* Completion, warning, overdue, and destructive states.
* Continuous corner radii.
* Spacing.
* Typography.
* Animation timing.
* Spring configurations.
* Focus states.
* High-contrast fallbacks.
* Reduced-transparency fallbacks.

Use a system-first typography stack:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Segoe UI",
  sans-serif;
```

Use glass only for major surfaces:

* Main Spotlight window.
* Search bar.
* Search result container.
* Todo workspace.
* Sidebar.
* Notes panel.
* Menus.
* Dialogs.
* Popovers.
* Notifications.

Avoid applying a separate blur filter to every result row.

## Required Shared Components

Create or refactor reusable components such as:

* `LiquidGlassSurface`
* `SpotlightWindow`
* `SpotlightSearch`
* `SearchResultRow`
* `QuickActionButton`
* `GlassToolbar`
* `GlassSidebar`
* `GlassPopover`
* `GlassDialog`
* `ContextMenu`
* `ToastNotification`
* `EmptyState`
* `LoadingState`
* `ThemeProvider`
* `MotionProvider`

## Motion Requirements

Implement restrained and interruptible motion:

* Hover: 120–160 ms.
* Press: 90–130 ms.
* Menu: 160–220 ms.
* Search expansion: 260–340 ms.
* Panel opening: 280–380 ms.

The compact Spotlight bar must expand smoothly rather than abruptly swapping interfaces.

Animate:

* Width.
* Height.
* Corner radius.
* Shadow.
* Surface opacity.
* Result appearance.
* Toolbar appearance.
* Todo workspace appearance.

## Accessibility

Implement:

* Visible keyboard focus.
* Semantic buttons and inputs.
* Screen-reader labels.
* Keyboard navigation.
* Reduced-motion behavior.
* Reduced-transparency mode.
* High-contrast compatibility.
* Minimum 44×44 pixel touch targets on touch layouts.

### Exit Criteria

* Light and dark themes are complete.
* Theme preference persists.
* No unreadable low-contrast glass surfaces remain.
* Reduced-motion and reduced-transparency modes work.
* Components use centralized tokens instead of duplicated styles.
* Compact and expanded states animate smoothly.

---

# Phase 2 — File Indexing and Local Database Foundation

## Prompt

Implement a high-performance offline indexing engine that scans approved user directories and stores searchable file and folder paths locally.

The implementation must work without administrator privileges.

## Database Schema

Create a migration-managed SQLite schema containing fields similar to:

```text
id
normalized_path
display_path
name
name_normalized
parent_path
entry_type
extension
size
created_at
modified_at
indexed_at
last_seen_scan_id
is_available
open_count
last_opened_at
first_opened_at
is_favorite
```

Create:

* Unique index on normalized path.
* Index on entry type.
* Index on extension.
* Index on modified date.
* Index on last-opened date.
* Index on open count.
* FTS5 table for name and searchable path segments.

## Initial Scan

On the first application launch:

1. Detect that no completed index exists.
2. Display a clear first-scan state.
3. Scan the approved user directories automatically.
4. Skip excluded and inaccessible directories safely.
5. Write records in batches.
6. Show progress without blocking typing or rendering.
7. Persist scan state.
8. Support cancellation.
9. Resume or restart safely after interruption.
10. Record the final completion date and time.

## Scan Architecture

Implement:

* Bounded traversal concurrency.
* Backpressure.
* Batched SQLite transactions.
* Cancellation tokens.
* Structured progress events.
* Structured error reporting.
* IPC-safe progress messages.
* No renderer blocking.
* No synchronous recursive filesystem traversal on the UI thread.

## Security

* Validate all paths in the main process.
* Reject malformed or untrusted paths.
* Never allow arbitrary command execution.
* Do not follow dangerous recursive symbolic-link loops.
* Prevent scanning outside configured roots through path traversal.
* Keep Node integration disabled in the renderer.

### Exit Criteria

* First launch automatically indexes approved user files.
* System folders are excluded.
* Access-denied directories do not crash the scan.
* Large directory trees do not freeze the interface.
* Indexed paths remain available after restart.
* Search can query the database before scanning is fully complete.
* Scan progress and errors are visible and understandable.

---

# Phase 3 — Incremental Sync and Index Maintenance

## Prompt

Implement a user-triggered Sync action that updates the existing index efficiently.

The Sync operation must detect:

* Newly created files.
* Newly created folders.
* Deleted files.
* Deleted folders.
* Renamed paths.
* Changed timestamps.
* Changed sizes.
* Unavailable removable-drive paths.

Do not erase and rebuild the entire database for every Sync unless recovery is explicitly required.

## Sync Workflow

1. Start a new scan session with a unique scan ID.
2. Traverse all approved roots.
3. Upsert discovered entries.
4. Mark each discovered entry with the current scan ID.
5. After successful traversal, mark unseen entries as unavailable or deleted.
6. Preserve user-history fields such as:

   * Open count.
   * Last-opened date.
   * Favorite state.
7. Optimize and checkpoint the database when appropriate.
8. Store:

   * Last successful Sync date and time.
   * Sync duration.
   * Number of added entries.
   * Number of updated entries.
   * Number of removed entries.
   * Number of skipped paths.
   * Number of errors.

## UI Requirements

Add a functional Sync button that:

* Shows idle, syncing, success, partial-success, cancelled, and failure states.
* Displays progress.
* Can cancel an active Sync.
* Prevents duplicate concurrent Sync operations.
* Updates the visible last-sync timestamp.
* Shows a concise completion summary.

### Exit Criteria

* Added files appear after Sync.
* Deleted files are removed or marked unavailable.
* Renamed files do not leave incorrect duplicate records.
* History data is preserved.
* Sync does not block search or Todo interactions.
* Last-sync date and time persist after restart.

---

# Phase 4 — Spotlight Search Bar and Results Experience

## Prompt

Build the main Spotlight Search experience using the Apple Liquid Glass design system.

The default state must be a compact centered floating search bar. It must expand into a result workspace when focused, typed into, or navigated.

## Compact State

Display:

* Search input.
* Search icon.
* Clear button when text exists.
* Sync action.
* Todo action.
* Optional keyboard-shortcut indicator.
* Visible keyboard focus state.

## Search State

Show live matching results beneath the anchored search field.

Each file result must include:

* File or folder icon.
* File or folder name.
* Parent path.
* File extension or type.
* Modified date where useful.
* Availability state.
* Open button.
* Context menu.

## Search Behavior

Implement:

* Immediate prefix and token matching.
* Fuzzy name matching.
* Path-segment matching.
* File-extension matching.
* Ranking by relevance.
* Ranking boost from open frequency.
* Ranking boost from recent use.
* Ranking boost from exact-name matches.
* Safe result limits and pagination or virtualization.

Keep typing responsive. Debounce only expensive work.

## Keyboard Support

Implement:

* Arrow Down and Arrow Up to navigate.
* Enter to open the selected result.
* Escape to clear, collapse, or close according to context.
* Tab to move through actions.
* Command or Control shortcuts where appropriate.
* Home and End for result navigation.
* Accessible selected-result announcements.

## Open Action

For each result:

* Provide a visible Open button.
* Double-click or Enter should open files with the operating system’s default application.
* Provide an optional “Show in File Explorer” context action.
* Use the stored indexed path.
* Validate that the path still exists before opening.
* If unavailable, show a helpful error and offer Sync.

Use Electron APIs such as:

* `shell.openPath()` for opening a file or folder.
* `shell.showItemInFolder()` for revealing a file in Explorer.

Do not execute a path through a command shell.

## Search Empty States

Show meaningful states for:

* No query.
* No results.
* Scan in progress.
* No index yet.
* Database unavailable.
* File no longer exists.
* Sync recommended.

### Exit Criteria

* Search remains responsive with a large index.
* Result ranking is useful.
* Every Open action works safely.
* Keyboard navigation is complete.
* Search state transitions are animated.
* Missing files do not crash the application.

---

# Phase 5 — Recent Files and Frequently Opened Files

## Prompt

Implement local usage history for indexed search results.

Every successful file or folder open must update:

* `open_count`
* `last_opened_at`
* `first_opened_at`, when applicable

## Main Search Display

When the search input is empty, display clearly separated sections:

### Recent Files

Show files and folders ordered by most recent successful open date.

Use the label:

```text
Recently Opened
```

### Frequently Opened

Show files and folders ranked by usage frequency, with recency used as a tie-breaker.

Use a label such as:

```text
Frequently Opened
```

or:

```text
Most Used
```

Avoid ambiguous wording such as “usually visit.”

## Requirements

* Do not count failed open attempts.
* Keep recent and frequent lists local and offline.
* Avoid showing the same item twice when sections are displayed together, where practical.
* Allow history clearing through Settings.
* Confirm destructive history clearing.
* Preserve indexed entries when history is cleared.
* Handle unavailable files gracefully.

### Exit Criteria

* Recent items update after successful opening.
* Frequently opened ranking changes correctly.
* History survives application restart.
* Clearing history does not delete the file index.
* No sensitive file content is stored—only metadata and paths.

---

# Phase 6 — Last Sync Status and Application Health Indicators

## Prompt

Add a compact status area to the Spotlight interface.

Display:

* Last successful Sync date.
* Last successful Sync time.
* Current indexed item count.
* Current Sync state.
* Partial failure indication when some paths were skipped.

Example:

```text
Last synced: July 11, 2026 at 10:45 PM
```

The date and time must use the user’s locale and timezone.

Add a status-details popover containing:

* Indexed file count.
* Indexed folder count.
* Last Sync duration.
* Added count.
* Updated count.
* Removed count.
* Skipped count.
* Error count.
* Configured scan roots.

Do not expose low-level stack traces in the primary UI. Keep diagnostic details available in logs.

### Exit Criteria

* Status updates immediately after Sync.
* Status persists across restart.
* Date and time are correctly localized.
* Partial Sync failures are visible rather than reported as complete success.

---

# Phase 7 — Todo Application Entry and Workspace Shell

## Prompt

Implement a functional Todo button in the main Spotlight bar.

When selected, the compact Spotlight window must expand into the Todo workspace while keeping the search field visually anchored.

Do not open a disconnected or visually unrelated screen.

## Todo Workspace Layout

Desktop layout:

* Left translucent list sidebar.
* Main task workspace.
* Optional notes or task-details panel.
* Search field at the top.
* Minimal dividers.
* Rounded selectable task rows.
* Resizable panels where practical.

Mobile or narrow layout:

* Search-first view.
* Collapsible or sheet-based list menu.
* Full-height task details.
* Horizontal quick actions.
* Minimum 44×44 pixel controls.

## Sidebar

Include functional destinations such as:

* All Tasks
* Inbox
* Today
* Upcoming
* Flagged
* Completed
* Lists
* Tags
* Notes
* Focus
* Settings

Do not show unsupported destinations unless they are implemented.

### Exit Criteria

* Todo opens from the Spotlight bar.
* Returning to file search preserves previous search state where appropriate.
* Todo and search share the same Liquid Glass design language.
* Navigation works with keyboard and pointer input.
* Responsive behavior is complete.

---

# Phase 8 — Todo Search, Lists, Tasks, and Notes

## Prompt

Complete the Todo application functionality.

## Todo Search Bar

Support:

* Task-title search.
* Notes search.
* List-name search.
* Tag search.
* Status filtering.
* Due-date filtering.
* Natural-language task creation where feasible.

Examples:

```text
Buy groceries tomorrow at 6 PM
Show tasks due today
Create high-priority task
```

Parsed metadata must be shown as removable chips before task creation.

Pressing Enter should create a simple task without opening a full form.

## List Menu

Implement:

* Create list.
* Rename list.
* Reorder lists.
* Delete list with confirmation.
* List task counts.
* Selected-list state.
* Context menu.
* Keyboard navigation.
* Persistent ordering.

## Task Rows

Each task row must include:

* Animated completion control.
* Task title.
* Due date and due status.
* List indicator.
* Optional tags.
* Priority.
* Context menu.
* Drag handle on hover or keyboard focus.
* Accessible task-state label.

Task completion must:

1. Animate the completion control.
2. Briefly highlight the row.
3. Apply a subtle strike-through.
4. Reduce emphasis.
5. Move the task only after the animation.
6. Show an Undo notification.

## Notes Area

Implement a functional Notes area associated with either:

* The selected task.
* The selected list.
* A standalone Notes destination.

Clearly distinguish between these modes.

The Notes area must support:

* Plain text or lightweight Markdown.
* Automatic local saving.
* Last-edited timestamp.
* Empty state.
* Keyboard shortcuts.
* Unsaved-state handling.
* Accessible labels.
* Persistent storage.

Do not use a browser-only editor that requires a network connection.

## Todo Persistence

Store locally:

* Tasks.
* Lists.
* Notes.
* Tags.
* Due dates.
* Priorities.
* Completion state.
* Ordering.
* Application preferences.

Use migrations and avoid storing Todo data only in browser local storage when a durable desktop database is available.

### Exit Criteria

* Tasks can be created, edited, completed, restored, reordered, and deleted.
* Lists can be managed.
* Notes save and reload correctly.
* Todo search works.
* All Todo data survives application restart.
* No visible Todo control is decorative or nonfunctional.

---

# Phase 9 — Settings, Scan Locations, and User Control

## Prompt

Implement a Settings workspace that controls the desktop application without requiring administrator privileges.

## Required Settings

### Appearance

* System theme.
* Light theme.
* Dark theme.
* Reduced transparency override.
* Reduced motion override.

### Search and Indexing

* Display configured scan roots.
* Add user-selected folder.
* Remove optional folder.
* Restore default user folders.
* View excluded directories.
* Start Sync.
* Cancel Sync.
* Rebuild index with confirmation.
* View last-sync information.
* View index size.
* Clear search history without deleting the index.

### Todo

* Default list.
* Default task priority.
* Completed-task visibility.
* Notes behavior.
* Confirmation preferences.

### Data

* Show application-data location.
* Export Todo data.
* Import Todo data with validation.
* Back up the database.
* Restore from backup safely.

## Folder Selection

Use native folder selection.

Before accepting a root:

* Normalize the path.
* Check for duplicates.
* Reject operating-system roots.
* Warn about extremely broad paths.
* Verify read access.
* Prevent selecting the application runtime directory.

### Exit Criteria

* Settings persist.
* Users can control scan locations.
* Unsafe roots are rejected.
* Rebuild and clear actions require confirmation.
* Export and import do not corrupt existing data.

---

# Phase 10 — Performance, Reliability, and Recovery

## Prompt

Optimize the application for large indexes and long-term offline usage.

## Performance Requirements

* Virtualize long search-result lists.
* Virtualize long Todo lists.
* Avoid loading all indexed entries into renderer memory.
* Use parameterized database queries.
* Limit IPC payload size.
* Cancel obsolete search requests.
* Use monotonically increasing request identifiers to prevent stale results.
* Batch index writes.
* Avoid continuously animating blur.
* Animate transform and opacity when possible.
* Prevent unnecessary React re-renders.
* Lazy-load secondary Todo panels where appropriate.

## Reliability Requirements

Implement recovery for:

* Interrupted first scan.
* Interrupted Sync.
* Database migration failure.
* Database lock.
* Corrupted database.
* Removed removable drive.
* Deleted indexed path.
* Packaging path changes.
* Application moved to a new portable location.
* Application closed during writes.

Create structured logs stored inside the user-writable application data directory.

Do not write logs into Program Files or another protected location.

### Exit Criteria

* Search remains responsive during Sync.
* Large indexes do not freeze the renderer.
* Interrupted scans recover predictably.
* Database writes remain transactional.
* Errors are visible and actionable.
* Logs can be found without administrator access.

---

# Phase 11 — Portable Packaging and Extraction

## Prompt

Package the application as a fully offline portable Windows application.

The result must work without:

* Installation.
* Administrator access.
* Internet connectivity.
* Globally installed Node.js.
* Globally installed npm packages.
* A Windows service.
* Registry modifications required for core functionality.

## Required Packaging Outputs

Produce:

1. Portable executable, where supported.
2. Per-user setup executable.
3. Unpacked portable application directory for validation.

## Portable Data Strategy

Define and implement a clear writable data-location strategy.

Preferred options:

### Portable Mode

Store data beside the executable in a folder such as:

```text
SpotlightData/
```

Use this only when the extracted directory is writable.

### User Data Fallback

When the portable directory is read-only, fall back safely to a user-writable location such as:

```text
%LOCALAPPDATA%\SpotlightTodo\
```

The application must clearly report which data location is active.

## Packaging Requirements

Bundle:

* Electron runtime.
* Renderer assets.
* SQLite native binaries.
* Database migrations.
* Icons.
* Fonts that are legally distributable, when any are included.
* Required native modules.
* Default configuration.
* Offline help or README.

Do not download dependencies on first launch.

## Distribution Instructions

Provide a concise README:

1. Choose either the no-install Portable executable or the per-user Setup executable.
2. Keep the Portable executable in a user-writable directory.
3. Launch the Portable executable or complete the Setup wizard.
4. Allow the automatic first scan to finish.
5. Use Sync when files are added, removed, or moved.
6. Keep the application data folder when upgrading.

### Exit Criteria

* The Portable executable runs without installation.
* The per-user Setup executable installs without administrator access.
* The app runs from a non-administrator Windows account.
* No installation wizard is required.
* No runtime download occurs.
* SQLite and indexing work in packaged mode.
* File opening works in packaged mode.
* Data survives application upgrades and relocation according to the documented strategy.

---

# Phase 12 — Testing and Final Validation

## Prompt

Perform complete validation of the Spotlight Search and Todo application.

Do not declare completion based only on a successful development build.

## Functional Validation

Verify:

* First-launch automatic scan.
* Excluded system directories.
* Scan progress.
* Scan cancellation.
* Scan recovery.
* Manual Sync.
* Added-file detection.
* Deleted-file detection.
* Renamed-file handling.
* Search ranking.
* File opening.
* Show in Explorer.
* Recently opened items.
* Frequently opened items.
* Last-sync timestamp.
* Todo workspace opening.
* Todo search.
* Task creation.
* Task completion and Undo.
* Task editing.
* Task reordering.
* List management.
* Notes saving.
* Theme persistence.
* Settings persistence.
* Portable relocation.
* Offline operation.

## Keyboard Validation

Verify:

* Search focus shortcut.
* Arrow-key result navigation.
* Enter action.
* Escape behavior.
* Tab order.
* Context menu keyboard use.
* Todo keyboard navigation.
* Dialog focus trapping.
* Focus restoration after closing overlays.

## Accessibility Validation

Verify:

* Contrast.
* Screen-reader labels.
* No color-only status.
* Reduced motion.
* Reduced transparency.
* High contrast.
* Text scaling.
* Focus visibility.

## Responsive Validation

Test:

* Small desktop window.
* Standard laptop window.
* Large desktop window.
* Tablet-sized viewport.
* Narrow mobile-like viewport where supported.

## Performance Validation

Test with:

* 10,000 indexed entries.
* 100,000 indexed entries.
* A large Todo list.
* Search during Sync.
* Repeated open actions.
* Repeated application restarts.

Measure:

* Search latency.
* Initial render time.
* Renderer memory.
* Main-process memory.
* Database size.
* Scan duration.
* Sync duration.

## Build Validation

Run and report:

* Build.
* Lint.
* Type-check.
* Unit tests.
* Integration tests.
* Packaging.
* Portable smoke test.
* Offline smoke test.

### Final Completion Criteria

The project is complete only when:

1. The compact Spotlight bar smoothly expands into search or Todo workspaces.
2. The first launch automatically scans approved user folders.
3. Manual Sync correctly updates added, deleted, moved, and renamed paths.
4. Search remains responsive with a large index.
5. Search results open using their stored paths.
6. Recent and frequently opened files work correctly.
7. Last Sync date and time are visible and persistent.
8. The Todo button opens a complete functional Todo application.
9. Todo search, lists, tasks, completion, reordering, and notes work.
10. Light and dark Liquid Glass themes are complete.
11. Keyboard navigation works throughout.
12. Reduced-motion and reduced-transparency modes work.
13. No administrator access is required.
14. The application runs fully offline.
15. Portable and Setup executable outputs are validated.
16. Existing business logic and stored data remain intact.
17. No visible control is decorative, broken, or disconnected.
18. Build, lint, type-check, tests, packaging, and responsive checks pass.
19. Any unresolved problem is documented explicitly.
20. The final implementation is visually and functionally reviewed across all application states.

---

# Recommended Phase Execution Order

Execute the work in this order:

```text
Phase 0  — Repository assessment
Phase 1  — Liquid Glass design system
Phase 2  — Database and initial indexing
Phase 3  — Incremental Sync
Phase 4  — Spotlight search interface
Phase 5  — Recent and frequent files
Phase 6  — Sync status
Phase 7  — Todo workspace shell
Phase 8  — Todo lists, tasks, search, and notes
Phase 9  — Settings and scan locations
Phase 10 — Performance and recovery
Phase 11 — Portable packaging
Phase 12 — Complete validation
```

Do not skip directly to visual redesign before establishing the indexing, persistence, security, and packaging architecture.
