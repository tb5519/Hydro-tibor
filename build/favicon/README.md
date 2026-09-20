# OneByOne favicon

The source `favicon.svg` is a simple OneByOne blue tile with custom geometric One
letterforms. It uses paths rather than fonts so the mark is identical on every
build machine. No runtime dependency or external asset is loaded by the website.

Build locally from the repository root:

```sh
pnpm --dir build/favicon install --frozen-lockfile --ignore-workspace
pnpm --dir build/favicon run build
```

The pinned renderer creates 16/32/96 px PNG icons, 180 px Apple and 192 px Android
icons, plus a 16/32/48/64 px ICO. It copies these and the SVG into both
`packages/ui-default/static` and `packages/ui-default/public`. The main UI
webpack build already copies `static` into `public`, so later UI builds preserve
the new mark. The local production manifest is updated when present.

The shared `templates/layout/html5.html` selects the SVG, provides PNG/ICO
fallbacks, and applies a favicon-specific cache version. Change that version
when replacing the design. Production servers only receive prepared assets;
do not run the generator or build the UI on the server.
