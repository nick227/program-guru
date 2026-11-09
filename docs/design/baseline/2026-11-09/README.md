# Visual baseline: 2026-11-09

The approved comparison board taken before the site-wide visual migration. Later migrations are compared against these screenshots. Do not overwrite them; capture a new dated folder instead.

- **Board:** open `index.html` locally, or the published copy at https://claude.ai/artifact/9Ket5TbRPNdCjPAv7gXRE4 (private).
- **Screens:** Program page, Discover (`/discover` type picker and `/discover/browse` library sheet), My Programs (`/library`), Activity occurrence, Calendar week, and the Program editor (Add a Program + Details, Activities, Publish & Share).
- **Widths:** desktop 1280px, tablet 768px, mobile 390px. Dark theme. Full-page captures are clipped at 4200px.
- **State:** the Program page is Antigravity's redesign **before** its data-correctness pass. It still shows invented participants, media, durations and schedule. The board marks each one.
- **Data:** local dev database with the E2E accounts. The participant account holds 14 E2E-run "Browser strength" Programs, so My Programs, Calendar and the editor show test data.

## Recapture

With the API (`:3001`) and web (`:5173`) running:

```sh
cd apps/web
mkdir -p ../../docs/design/baseline/<date>/shots
node scripts/capture-design-baseline.mjs ../../docs/design/baseline/<date>/shots
```

Override `PROGRAM_ID`, `OCCURRENCE_ID`, `WORKSPACE_ID` and the `E2E_*` credentials for another database.
