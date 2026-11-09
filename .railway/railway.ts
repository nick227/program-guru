// Railway Infrastructure as Code for Program Guru UAT (project program-guru). Review with
// `railway config plan`; apply only with explicit approval. Secrets are preserve(): set them in Railway
// (railway variable set), never in source. Release order and checks: docs/release/UAT-HANDOFF.md.
//
// Topology: ONE public origin, https://program-guru.up.railway.app (the `web` service). up.railway.app
// is a public suffix, so a separate API domain would be a different site and SameSite=Lax session
// cookies would not flow. `web` serves the production build and proxies /api over the private network
// to `server`, which has no public domain: its only peers are this project's services.
import { bucket, database, defineRailway, github, preserve, project, ref, service } from "railway/iac";

const ORIGIN = "https://program-guru.up.railway.app";

export default defineRailway(() => {
  // Pinned: the mysql() helper defaults to mysql:9; this database runs mysql:8 (8.4.x, as tested).
  const db = database("MySQL", "mysql", { image: "mysql:8" });
  const media = bucket("media", { region: "iad" });
  const source = github("nick227/program-guru", { branch: "main" });
  // One build for the API and the worker: Prisma client generation, then the esbuild bundles.
  const serverBuild = {
    buildCommand: "pnpm --filter @project/db generate && pnpm --filter server build",
    watchPatterns: ["/apps/server/**", "/packages/**", "/package.json", "/pnpm-lock.yaml"],
  };
  // Railway Bucket through the S3-compatible provider (same values for API and worker).
  const storage = {
    STORAGE_PROVIDER: "r2",
    S3_ENDPOINT: ref(media, "ENDPOINT"),
    S3_REGION: ref(media, "REGION"),
    R2_BUCKET: ref(media, "BUCKET"),
    R2_ACCESS_KEY_ID: ref(media, "ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: ref(media, "SECRET_ACCESS_KEY"),
  };

  const server = service("server", {
    source,
    build: serverBuild,
    // Migrations, then the idempotent catalog/media bootstrap (fails the deploy if a migration is missing).
    preDeploy: "pnpm db:deploy && pnpm --filter server bootstrap:prod",
    start: "pnpm --filter server start",
    healthcheck: "/health",
    env: {
      NODE_ENV: "production",
      PORT: "3001",
      DATABASE_URL: db.env.MYSQL_URL,
      ...storage,
      // Uploads go through the API, so the bucket needs no CORS.
      STORAGE_DIRECT_UPLOAD: "false",
      MEDIA_URL_SECRET: preserve(),
      EMAIL_LINK_SECRET: preserve(),
      PUBLIC_API_URL: `${ORIGIN}/api`,
      PUBLIC_APP_URL: ORIGIN,
      CORS_ORIGIN: ORIGIN,
      // Requests arrive from `web` over this project's private network (observed peer
      // fd12:3c86:6500:1:…) carrying Railway's X-Real-IP, which the edge overwrites with the real client
      // address (verified: forged values change nothing; two networks get separate limits). Trust only
      // this project's private range, not every private address.
      CLIENT_IP_HEADER: "x-real-ip",
      TRUSTED_PROXY_CIDRS: "fd12:3c86:6500::/48",
      MARKETPLACE_ENABLED: "false",
      // UAT only, while no email provider exists: unverified accounts may publish. Verification itself
      // keeps working and nobody is marked verified. Remove (defaults to required) for production.
      REQUIRE_EMAIL_VERIFICATION: "false",
    },
  });

  const web = service("web", {
    source,
    build: {
      buildCommand: "pnpm --filter web build",
      watchPatterns: ["/apps/web/**", "/packages/sdk/**", "/packages/shared/**", "/package.json", "/pnpm-lock.yaml"],
    },
    start: "pnpm --filter web exec vite preview",
    healthcheck: "/",
    env: {
      // The public domain program-guru.up.railway.app targets port 3001 on this service.
      PORT: "3001",
      // Build time: the SDK calls /api on the same origin.
      VITE_API_URL: `${ORIGIN}/api`,
      // Runtime: vite preview forwards /api to the API over the private network.
      API_PROXY_TARGET: "http://server.railway.internal:3001",
      // Railway's healthcheck sends Host: healthcheck.railway.app.
      PREVIEW_ALLOWED_HOSTS: "program-guru.up.railway.app,healthcheck.railway.app",
    },
  });

  // Worker: media processing (ffmpeg), outbox delivery (notifications), reminders, horizons, cleanup.
  // No public domain and no healthcheck path: its startup preflight (ffmpeg, ffprobe, database,
  // storage, config gate) exits non-zero on any problem, which fails the deployment.
  const worker = service("worker", {
    source,
    build: serverBuild,
    // No-op once the API has migrated (Prisma advisory lock); keeps a worker that deploys first from
    // running new code on an old schema.
    preDeploy: "pnpm db:deploy",
    start: "pnpm --filter server start:worker",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.MYSQL_URL,
      ...storage,
      // Signed media URLs and email links must verify across processes: reference the API's secrets.
      MEDIA_URL_SECRET: server.env.MEDIA_URL_SECRET,
      EMAIL_LINK_SECRET: server.env.EMAIL_LINK_SECRET,
      PUBLIC_API_URL: `${ORIGIN}/api`,
      PUBLIC_APP_URL: ORIGIN,
      MARKETPLACE_ENABLED: "false",
      RAILPACK_DEPLOY_APT_PACKAGES: "ffmpeg",
      // UAT without an email provider: messages are dropped and their contents never logged.
      // Switch to resend (RESEND_API_KEY, EMAIL_FROM) when a sending domain is verified.
      EMAIL_PROVIDER: "disabled",
    },
  });

  return project("program-guru", { resources: [db, media, server, web, worker] });
});
