# Program Guru — Starter Catalog & Example Seed

A compact editorial starting point for AI-assisted catalog expansion.

## Bundle contents

- `catalog.json`: **12 domains / 20 curated categories**. The narrower `Focus` terminology has been replaced with `Category`, and the former top-level categories are now `Domain`.
- `examples.json`: **20 Activities, 5 Programs, 4 referenced real Austin Places**. Activities include plain and multi-instruction formats, local, online, individual, social, collaborative, and multi-stage examples.

## Rules

1. Use `domain` and `category` slugs from `catalog.json` for new Program/Activity examples. Do not recreate `focus` or `tier` fields.
2. Use one Activity definition for reusable work; Programs group Activities. Program `activityIds` and dependencies refer to valid records in `examples.json`.
3. Place references must exist in `places` and describe real locations, never claim hosts, attendees, bookings, or venue sponsorship.
4. Recurrence and venue hours are **suggestions / access constraints**, not confirmed events. Don't generate attendees or calendar occurrences during seeding.
5. Preserve title / description / instruction language rules in `editorialStandard`; avoid filler and generic benefits.
6. Keep entity IDs stable when expanding. Add new domain/category slugs deliberately and keep all foreign references valid.
7. These are raw editorial JSON examples, **not directly importable Prisma fixtures**. Audit existing Program Guru schema and seed writer, then map safely while preserving published revisions and history.
8. No tier classification is retained: actual Activities, schedule, locations, Program membership, and participation already express complexity.

## Counts and scope

This small starter intentionally does **not** cover every domain with example Activities. The taxonomy spans 12 domains, while the 20 examples emphasize a few varied, coherent Programs. The AI can grow catalog coverage over time without inventing duplicate records.

## Example

```json
{
  "domain": "arts-creativity",
  "category": "photography",
  "title": "Photograph the Austin Skyline"
}
```
