# Self-hosted fonts

| File | Family | Axis | Subset | Size |
| --- | --- | --- | --- | --- |
| `inter-latin-wght-normal.woff2` | Inter | `wght 100–900` | latin | 47 KB |
| `inter-latin-wght-italic.woff2` | Inter Italic | `wght 100–900` | latin | 48 KB |
| `playfair-display-latin-wght-normal.woff2` | Playfair Display | `wght 400–900` | latin | 38 KB |
| `playfair-display-latin-wght-italic.woff2` | Playfair Display Italic | `wght 400–900` | latin | 39 KB |

Variable fonts, so four files cover every weight the interface uses — the whole
type system costs ~170 KB, of which a first visit downloads only the two upright
faces (~85 KB).

**Why these files live in the repository**

`next/font/google` is the convenient option, but it makes the build depend on a
third-party CDN being reachable, and it adds a connection to `fonts.gstatic.com`
on every cold cache. Self-hosting removes the external dependency, removes a DNS
lookup plus TLS handshake from first paint, and means the type is byte-identical
in development, CI and production. `next/font/local` still handles the hard
parts: it fingerprints the files, emits `@font-face` with `font-display: swap`
and serves them from the same origin as the page.

**Replacing them**

Point `localFont` in `src/app/layout.tsx` at your own files, or swap to
`next/font/google` and delete this directory:

```ts
import { Inter, Playfair_Display } from "next/font/google";
```

**Licences** — both families are SIL Open Font License 1.1, which permits
redistribution in this form. Inter © Rasmus Andersson; Playfair Display ©
Claus Eggers Sørensen.
