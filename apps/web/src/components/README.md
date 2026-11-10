# Where components go

Organize by feature first, then by how widely something is reused.

| Folder | What belongs there |
|---|---|
| `ui/` | Generic primitives with no product knowledge: layout, buttons, inputs, `Dialog`, feedback. |
| `program/` | Showing and managing a Program: hero, header, stepper, library actions, owner editor, delete. |
| `program-authoring/` | Authoring controls shared by the Workspace, Program detail and Admin: Activity rows, schedule controls, publish controls, Program field rules. |
| `activity/` | An Activity and its dated occurrence: fields, metrics, instructions, occurrence media, Together. |
| `calendar/` | The Calendar surface and its tiles. |
| `media/` | Upload, capture, viewing, trays and galleries. |
| `social/` | Groups, invites, sharing and avatar stacks. |
| `account/` | Account menu, notifications, reminders and PWA controls. |
| `shared/` | Used by **several** of the features above, such as `EntityHero`, `Navigation` and `ReportButton`. |

Rules:

- Used by one feature: put it in that feature's folder, even if another feature might use it someday. Move it to `shared/` once a second feature actually imports it.
- Owns a route: put it in `src/pages/` (for example `pages/Browse.tsx`). Has no JSX: put it in `src/lib/`.
- Nothing goes directly in `components/`. Import with the `@/components/<folder>/<File>` alias, and don't add `index.ts` barrel files or a folder per component.
