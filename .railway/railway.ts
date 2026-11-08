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

  const server = service("server", {
    source,
    build: {
      buildCommand: "pnpm --filter @project/db generate && pnpm --filter server build",
      watchPatterns: ["/apps/server/**", "/packages/**", "/package.json", "/pnpm-lock.yaml"],
    },
    // Migrations, then the idempotent catalog/media bootstrap (fails the deploy if a migration is missing).
    preDeploy: "pnpm db:deploy && pnpm --filter server bootstrap:prod",
    start: "pnpm --filter server start",
    healthcheck: "/health",
    env: {
      NODE_ENV: "production",
      PORT: "3001",
      DATABASE_URL: db.env.MYSQL_URL,
      // Railway Bucket through the S3-compatible provider; uploads go through the API (no bucket CORS).
      STORAGE_PROVIDER: "r2",
      S3_ENDPOINT: ref(media, "ENDPOINT"),
      S3_REGION: ref(media, "REGION"),
      R2_BUCKET: ref(media, "BUCKET"),
      R2_ACCESS_KEY_ID: ref(media, "ACCESS_KEY_ID"),
      R2_SECRET_ACCESS_KEY: ref(media, "SECRET_ACCESS_KEY"),
      STORAGE_DIRECT_UPLOAD: "false",
      MEDIA_URL_SECRET: preserve(),
      EMAIL_LINK_SECRET: preserve(),
      PUBLIC_API_URL: `${ORIGIN}/api`,
      PUBLIC_APP_URL: ORIGIN,
      CORS_ORIGIN: ORIGIN,
      // Requests arrive from `web` over the private network carrying Railway's X-Real-IP.
      // TRUSTED_PROXY_CIDRS is narrowed to the observed private range after the first deploy.
      CLIENT_IP_HEADER: "x-real-ip",
      TRUSTED_PROXY_CIDRS: preserve(),
      MARKETPLACE_ENABLED: "false",
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
      // Build time: the SDK calls /api on the same origin.
      VITE_API_URL: `${ORIGIN}/api`,
      // Runtime: vite preview forwards /api to the API over the private network.
      API_PROXY_TARGET: "http://server.railway.internal:3001",
      // Railway's healthcheck sends Host: healthcheck.railway.app.
      PREVIEW_ALLOWED_HOSTS: "program-guru.up.railway.app,healthcheck.railway.app",
    },
  });

  // Worker (media processing, email, reminders): added once Resend is configured; its production
  // config gate requires EMAIL_PROVIDER=resend. Same build as `server`, start
  // "pnpm --filter server start:worker", RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg, no public domain.

  return project("program-guru", { resources: [db, media, server, web] });
});
