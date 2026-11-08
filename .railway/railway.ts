// Railway Infrastructure as Code for Programs App (replaces the deprecated railway.json, which new
// services cannot use and which stops being read on 2026-12-01). Review with `railway config plan`;
// apply only with explicit approval. Secrets are preserve(): set them in Railway, never in source.
// Release order and manual steps: docs/release/poc-release-checklist.md.
import { defineRailway, github, mysql, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const db = mysql("MySQL");
  const source = github("nick227/program-guru", { branch: "main" });
  // One build serves both processes: Prisma client generation, then the esbuild bundle (dist/).
  const build = "pnpm --filter @project/db generate && pnpm --filter server build";

  const shared = {
    NODE_ENV: "production",
    DATABASE_URL: db.env.MYSQL_URL,
    STORAGE_PROVIDER: "r2",
    R2_BUCKET: preserve(),
    R2_ACCOUNT_ID: preserve(),
    R2_ACCESS_KEY_ID: preserve(),
    R2_SECRET_ACCESS_KEY: preserve(),
    MEDIA_URL_SECRET: preserve(),
    EMAIL_LINK_SECRET: preserve(),
    PUBLIC_API_URL: preserve(),
    PUBLIC_APP_URL: preserve(),
    MARKETPLACE_ENABLED: "false",
  };

  // API: migrations, then the idempotent catalog/media bootstrap, before traffic moves (health: /health).
  const api = service("api", {
    source,
    build,
    preDeploy: "pnpm db:deploy && pnpm --filter server bootstrap:prod",
    start: "pnpm --filter server start",
    env: {
      ...shared,
      CORS_ORIGIN: preserve(),
      // Railway's edge sets X-Real-IP; trusted only from private/CGNAT peers (apps/server/src/lib/clientIp.ts).
      CLIENT_IP_HEADER: "x-real-ip",
      COOKIE_DOMAIN: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
    },
  });

  // Worker: same build. Its own migrate step is a no-op once the API applied them (Prisma takes an
  // advisory lock), and keeps a worker deployed first from running new code on an old schema.
  const worker = service("worker", {
    source,
    build,
    preDeploy: "pnpm db:deploy",
    start: "pnpm --filter server start:worker",
    env: {
      ...shared,
      RAILPACK_DEPLOY_APT_PACKAGES: "ffmpeg",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: preserve(),
      EMAIL_FROM: preserve(),
    },
  });

  return project("programs-app", { resources: [db, api, worker] });
});
