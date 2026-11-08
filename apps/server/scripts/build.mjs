// Production build: one CommonJS bundle per process (API, worker, bootstrap). Workspace packages
// (@project/*) are TypeScript source, so they are bundled in; real npm dependencies stay external and
// load from node_modules at runtime (Prisma's engine cannot be bundled).
import { build } from 'esbuild'
import { rmSync } from 'fs'

const workspaceInline = {
  name: 'externalize-node-modules',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith('@project/') ? undefined : { path: args.path, external: true }))
  },
}

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })
await build({
  entryPoints: { index: 'src/index.ts', worker: 'src/worker.ts', bootstrap: 'src/bootstrap.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  plugins: [workspaceInline],
})
