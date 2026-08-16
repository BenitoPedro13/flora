# Vendored sources

Every file here (and in `apps/web/utils/`) is pasted from its docs page, byte-identical, per
invariant 8 (`CLAUDE.md`). Do not hand-edit. The only permitted edits are documented bug fixes,
recorded below. Re-fetching each URL and diffing against the working tree should produce zero
differences except for rows marked "bug fix".

Fetched 2026-08-15 against AlignUI docs **v1.2** (`alignui.com/docs/v1.2/...`).

| File | Source | sha256 |
|---|---|---|
| `apps/web/utils/cn.ts` | [`alignui.com/docs/v1.2/utils/cn`](https://alignui.com/docs/v1.2/utils/cn) | `22aaa8d9aa84117a593571d6fa65299b4f35e8279ebf22b4505cf420b2c78bbe` |
| `apps/web/utils/tv.ts` | [`alignui.com/docs/v1.2/utils/tv`](https://alignui.com/docs/v1.2/utils/tv) | `0e97244340460e637ef3e9e1c296ef2e7ea83194f71ad117dd676b6722cb9723` |
| `apps/web/utils/polymorphic.ts` | [`alignui.com/docs/v1.2/utils/polymorphic`](https://alignui.com/docs/v1.2/utils/polymorphic) | `97c0eda0d098e45dcd909a030366d33e17e0128a2b39226f7c93a88e03629766` |
| `apps/web/utils/recursive-clone-children.tsx` | [`alignui.com/docs/v1.2/utils/recursive-clone-children`](https://alignui.com/docs/v1.2/utils/recursive-clone-children) | `fe8c15480a41f303dafbf941a4db4eb1f23dd3123b77d1e093c2fd8de716e176` |
| `components/ui/button.tsx` | [`alignui.com/docs/v1.2/ui/button`](https://alignui.com/docs/v1.2/ui/button) | `23c66b4470db4d591053e35b4ba3c9aafcb871ec7393b0ece2ba94aa9aa9771d` |
| `components/ui/compact-button.tsx` | [`alignui.com/docs/v1.2/ui/compact-button`](https://alignui.com/docs/v1.2/ui/compact-button) | `3352322270681bbef52c427710ef5ba4e003c1b66885a5fecf549b0d8c58a615` |
| `components/ui/link-button.tsx` | [`alignui.com/docs/v1.2/ui/link-button`](https://alignui.com/docs/v1.2/ui/link-button) | `ac6029bc890fee4b11bedfd5c8064d6eb5a41a7a1e05e29e495dfae12af74133` |
| `components/ui/avatar.tsx` | [`alignui.com/docs/v1.2/ui/avatar`](https://alignui.com/docs/v1.2/ui/avatar) | `ab6f5d461ac1b799e2cd27392d30ff833ece966326df911dab9222972141522b` |
| `components/ui/avatar-empty-icons.tsx` | Dependency of `avatar.tsx`, same page | `d9b1822a381c67cd8461d8da0d43d8e2e804bce90c2d3a7c9e9622509af382d7` |
| `components/ui/divider.tsx` | [`alignui.com/docs/v1.2/ui/divider`](https://alignui.com/docs/v1.2/ui/divider) | `eeb29a3c02d0ac2c8a4e78093b997f43e476343b4d616b3d597161b99c217167` |
| `components/ui/tooltip.tsx` | [`alignui.com/docs/v1.2/ui/tooltip`](https://alignui.com/docs/v1.2/ui/tooltip) | `ce6f508424bd7f320b07dbde7754b3277d6014876878cc9160b4a04371d8a178` |
| `components/ui/dropdown.tsx` | [`alignui.com/docs/v1.2/ui/dropdown`](https://alignui.com/docs/v1.2/ui/dropdown) | `90bfb12d97a379378a6db7eb1359345981d0fb7d4b12394e0c5920f530e6d108` |
| `components/ui/badge.tsx` | [`alignui.com/docs/v1.2/ui/badge`](https://alignui.com/docs/v1.2/ui/badge) | `c52421ac5ad8790838da9cbc268b2553a12ec4b05f2291e423d17eb4873bf799` |
| `components/ui/input.tsx` | [`alignui.com/docs/v1.2/ui/input`](https://alignui.com/docs/v1.2/ui/input) | `c7f8a537b9459c1e5db40ac317b29eba3da945b805f0eeb621c01f447bedb0ae` |
| `components/ui/label.tsx` | [`alignui.com/docs/v1.2/ui/label`](https://alignui.com/docs/v1.2/ui/label) | `eaaaa8b7e9e503dc99b73f981e4ba42de3c4cddbb721f6cded11be481fdafbab` |
| `components/ui/hint.tsx` | [`alignui.com/docs/v1.2/ui/hint`](https://alignui.com/docs/v1.2/ui/hint) | `cbf31dd63ee17946126b28537f4391bfa79a73290900b0d8bc85bc3711472e4e` |
| `components/ui/progress-bar.tsx` | [`alignui.com/docs/v1.2/ui/progress-bar`](https://alignui.com/docs/v1.2/ui/progress-bar) | `31fa2cbc813f67da19b8d320e95fb34c180b628c047ac6e4ec0eaa98258318b7` |
| `components/ui/kbd.tsx` | [`alignui.com/docs/v1.2/ui/kbd`](https://alignui.com/docs/v1.2/ui/kbd) | `32a5dc8f069387ad89aaecbc0f248f3803d1cbc1a44161756c8ddf573698578c` |
| `components/ui/select.tsx` | [`alignui.com/docs/v1.2/ui/select`](https://alignui.com/docs/v1.2/ui/select) | `7c7cde16f2377c460e7cd17ead70c9bc53302d3d650b9e0e584b90872adf842c` |
| `components/ui/modal.tsx` | [`alignui.com/docs/v1.2/ui/modal`](https://alignui.com/docs/v1.2/ui/modal) | `de1a77649bbb1ce6c5242023b705ceac842e1c184b4391dcf24fae82be2de730` |
| `components/ui/file-upload.tsx` | [`alignui.com/docs/v1.2/ui/file-upload`](https://alignui.com/docs/v1.2/ui/file-upload) | `777ff62a087aaf74999d780eafb32831f4021cdcd5b407c3e8246e0a14030938` |
| `components/ui/chart.tsx` | [`github.com/shadcn-ui/ui` — `apps/v4/registry/new-york-v4/ui/chart.tsx`](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/chart.tsx) | `974580b8850059ae63cba7c658ed3c3252dce647f04d83ec24cde24335933403` (upstream: `84b423d5fd7e645c3c259d8cde84765dcc4e185450dcb3494a39a20f935bf5c7`) — **bug fix**: `import { cn } from "@/lib/utils"` → `import { cn } from "@/utils/cn"` (this repo's alias, per `components.json`) |

## `progress-bar`, `kbd`, `select`, `modal`, `file-upload` (TASK-fields)

Fetched 2026-08-15 the same way as every row above — but the docs site (rebuilt since the shell
task) no longer renders a plain "view source" HTML block; the component source is embedded as a
Next.js RSC flight payload (`self.__next_f.push(...)`), doubly JSON-string-escaped for `kbd`,
`modal` and `file-upload` (a `code`-prop string nested inside the outer flight string) and
singly-escaped for `select` (embedded as page markup text, not a nested prop). Extracted with a
throwaway script: concatenate the flight chunks, locate each component's `// AlignUI <Name>
v0.0.0` header, decode however many JSON layers are present, and cut at that component's own
trailing `export { ... };` — never at the next header, which several pages (`select` in
particular) follow with unrelated demo/usage code in the same flight chunk. `sha256sum` above is
the byte-for-byte proof that no stray demo code or escaping artifact rode along.

`file-upload`'s docs page also renders `FileFormatIcon` as a demo dependency (same pattern as
`avatar-empty-icons.tsx`), but nothing in this task's `ImportCard` (§2.9 — a GeoJSON file has one
format, not several) needs a per-format icon, so it was left unvendored.

## Why `chart.tsx` came from GitHub, not `shadcn add chart`

`pnpm dlx shadcn@latest add chart --dry-run --diff` (2026-08-15, design-spec §7.1's `[VERIFY]`)
creates `components/ui/card.tsx` alongside `chart.tsx` — an unwanted extra dependency Flora
doesn't use (the product's own `Card`/`CardHeader` composite lives in `components/flora/card.tsx`,
design-spec §4.5). It does **not** touch `app/globals.css` or `package.json` in this project.
Per the task doc's own criterion ("if it touches nothing but `chart.tsx`, run it for real"), the
extra file disqualifies the CLI path, so `chart.tsx` was fetched directly from the shadcn-ui/ui
monorepo instead — same file, minus the unwanted sibling.

## Cross-check note

`github.com/alignui/alignui-nextjs-typescript-starter` (pushed 2025-02-16, Tailwind v3-era) was
used only to sanity-check `utils/polymorphic.ts` (byte-identical to what's vendored here — it has
no `import * as React` because `@types/react` declares `React` as a UMD global for type
positions) and to confirm `utils/cn.ts`/`utils/tv.ts` genuinely changed for v4 (the starter's
versions still import `@/tailwind.config`, which does not exist in this CSS-only v4 setup — the
docs-page versions vendored here compute the typography pattern list at runtime instead, and are
correct for this project).
