# base-lyra component inventory

Research for ticket `03-shadcn-base-lyra-inventory-research.md`. Everything below
was fetched on 2026-08-29 from the live registry, the live docs, and the
published packages — not recalled. Every claim carries its URL.

**Headline:** item 5 (blobatar palette colours) **passes, but the vocabulary in
ticket 01 is wrong** and must be corrected. See [§5](#5-blobatar-palette-and-expression--the-critical-item)
first.

---

## 0. How this distribution is addressed

`components.json` declares `"style": "base-lyra"`, and the registry serves a
per-style tree at `https://ui.shadcn.com/r/styles/<style>/<item>.json`. Every
`base-lyra` item fetched below imports from `@base-ui/react/*`. **No item in the
chain imports anything from `@radix-ui/*`.**

Verified by fetching each item and grepping its `files[0].content` for imports:

| item | primitive it wraps | source |
| --- | --- | --- |
| `button` | `@base-ui/react/button` | `https://ui.shadcn.com/r/styles/base-lyra/button.json` |
| `input` | `@base-ui/react/input` | `.../input.json` |
| `separator` | `@base-ui/react/separator` | `.../separator.json` |
| `dropdown-menu` | `@base-ui/react/menu` | `.../dropdown-menu.json` |
| `select` | `@base-ui/react/select` | `.../select.json` |
| `popover` | `@base-ui/react/popover` | `.../popover.json` |
| `tooltip` | `@base-ui/react/tooltip` | `.../tooltip.json` |
| `dialog` | `@base-ui/react/dialog` | `.../dialog.json` |
| `sheet` | `@base-ui/react/dialog` | `.../sheet.json` |
| `avatar` | `@base-ui/react/avatar` | `.../avatar.json` |
| `sidebar` | `@base-ui/react/merge-props` + `use-render` (no primitive) | `.../sidebar.json` |
| `calendar` | `react-day-picker` (not Base UI) | `.../calendar.json` |
| `skeleton`, `use-mobile` | plain React | `.../skeleton.json`, `.../use-mobile.json` |

**I could not find a shadcn docs page that names `base-lyra`.** It is not in
`https://ui.shadcn.com/docs/changelog.md` and there is no `/docs/styles.md` or
`/docs/bases.md`. The style's existence is established by the registry endpoints
returning 200 (above), not by prose documentation. Component docs live under
`https://ui.shadcn.com/docs/components/base/<name>.md` (the "base" base), which
is what each `base-lyra` registry item's `meta.links.docs` points at.

### The `IconPlaceholder` red herring

Every raw `base-lyra` payload contains this line:

```tsx
import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"
```

…used as `<IconPlaceholder lucide="PanelLeftIcon" tabler="IconLayoutSidebar" …/>`.
That path does not exist in any consumer project. **It is resolved by the CLI at
install time from `components.json`'s `iconLibrary`.** Proof from this repo:
`https://ui.shadcn.com/r/styles/base-lyra/select.json` contains four
`IconPlaceholder` usages, while the installed
`/Users/gianlucazoni/DEV/_side-quests/friens-cal/src/components/ui/select.tsx`
opens with `import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"`.
So this is normal and not a blocker — but it does mean **you cannot hand-copy a
registry payload into `src/components/ui/`**; the CLI has to do the icon
substitution.

### Already installed vs. would need adding

Installed at `/Users/gianlucazoni/DEV/_side-quests/friens-cal/src/components/ui/`:
`alert-dialog`, `badge`, `button`, `card`, `combobox`, `dropdown-menu`, `field`,
`input-group`, `input`, `label`, `navigation-menu`, `select`, `separator`,
`textarea`.

Not installed, all confirmed available for `base-lyra`: `sidebar`, `calendar`,
`avatar`, `popover`, `tooltip`, `dialog`, `sheet`, `skeleton`, `use-mobile`,
`scroll-area`, `toggle-group`.

`@base-ui/react@^1.2.0` is already in `package.json`, so the Base UI primitives
these items import are present.

---

## 1. Sidebar

**Exists.** `https://ui.shadcn.com/r/styles/base-lyra/sidebar.json` → 200, a
730-line `registry/base-lyra/ui/sidebar.tsx`.

Its `registryDependencies` are `["button", "input", "separator", "sheet",
"skeleton", "tooltip", "use-mobile"]` and it declares **no npm dependencies**.
Of those, `button`, `input` and `separator` are already installed here; `sheet`,
`skeleton`, `tooltip` and the `use-mobile` hook would be pulled in.

Docs: `https://ui.shadcn.com/docs/components/base/sidebar.md`.

### Exported surface

`Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`,
`SidebarGroupAction`, `SidebarGroupContent`, `SidebarGroupLabel`,
`SidebarHeader`, `SidebarInput`, `SidebarInset`, `SidebarMenu`,
`SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem`,
`SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`,
`SidebarMenuSubItem`, `SidebarProvider`, `SidebarRail`, `SidebarSeparator`,
`SidebarTrigger`, `useSidebar`.

### State API

`SidebarProvider` props (docs table, matches the source):

| prop | type | note |
| --- | --- | --- |
| `defaultOpen` | `boolean` | defaults `true` |
| `open` | `boolean` | controlled |
| `onOpenChange` | `(open: boolean) => void` | controlled |

`useSidebar()` returns
`{ state: "expanded" | "collapsed", open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }`
and throws `"useSidebar must be used within a SidebarProvider."` outside a provider.

`Sidebar` props: `side: "left" | "right"` (default `"left"`),
`variant: "sidebar" | "floating" | "inset"`, `collapsible: "offcanvas" | "icon" | "none"`
(default `"offcanvas"`).

### Cookie persistence

From the registry source:

```tsx
const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7   // 7 days
```

`setOpen` writes `document.cookie = \`${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=…\``
on **every** change, including when the provider is controlled (the write is
outside the `if (setOpenProp)` branch). **Nothing reads the cookie back.** In the
upstream Next.js story a server component reads it and feeds `defaultOpen`; in a
Vite SPA there is no server, so as shipped this cookie is **write-only and inert**.
If we want persistence we read it ourselves — or, given ticket 01 says view state
is deliberately ephemeral, delete the write.

### Two sidebars, left and right

**Both `side="left"` and `side="right"` render correctly at the same time** — the
container carries `data-side={side}` and the classes handle both
(`data-[side=left]:left-0` / `data-[side=right]:right-0`, and the mirrored
off-canvas transforms). The mobile branch forwards `side` straight to
`SheetContent`.

**But state is per-`SidebarProvider`, not per-`Sidebar`.** One provider holds one
`open` boolean, so two `<Sidebar>`s under one provider **open and close together**.
The docs only ever discuss multiple sidebars in terms of *width*:

> "For multiple sidebars in your application, you can use the `--sidebar-width`
> and `--sidebar-width-mobile` CSS variables in the `style` prop."
> — `https://ui.shadcn.com/docs/components/base/sidebar.md`

There is **no documented multi-sidebar state API.** To get independent left/right
toggling you have two options, both ours to write:

1. **Nest two `SidebarProvider`s**, one per side, each with its own `open`/
   `onOpenChange`. Costs: each provider renders its own
   `div.group/sidebar-wrapper.flex.min-h-svh.w-full` wrapper (nested flex rows,
   workable but fiddly with `SidebarInset`, which is a `<main>`); **each provider
   registers its own `cmd+b` listener**, so one keypress toggles both; and both
   write the same `sidebar_state` cookie, clobbering each other.
2. **Fork `sidebar.tsx`** — it is copied into our tree and ours to edit — to
   carry two independent open states, or to parameterise the provider with a
   `keyboardShortcut` / `cookieName` prop. Given (1)'s three collisions, this is
   the cleaner route.

Unconfirmed: I found no upstream block or example that mounts two independently
toggled sidebars. `https://ui.shadcn.com/blocks` was not exhaustively searched.

---

## 2. Keyboard shortcuts

**There is no prop or config for this. The shortcut is a hardcoded constant plus
a `useEffect` inside the copied component.** Source
(`https://ui.shadcn.com/r/styles/base-lyra/sidebar.json`):

```tsx
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

// inside SidebarProvider
React.useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault()
      toggleSidebar()
    }
  }
  window.addEventListener("keydown", handleKeyDown)
  return () => window.removeEventListener("keydown", handleKeyDown)
}, [toggleSidebar])
```

The docs say only:

> "To trigger the sidebar, you use the `cmd+b` keyboard shortcut on Mac and
> `ctrl+b` on Windows." — with the same constant reproduced.
> `https://ui.shadcn.com/docs/components/base/sidebar.md`

Consequences:

- **Can it be remapped?** Only by editing `SIDEBAR_KEYBOARD_SHORTCUT` in our copy.
  There is no prop.
- **Can it be disabled?** Only by deleting the `useEffect` in our copy.
- **Note the modifier check ignores shift.** `event.metaKey || event.ctrlKey` with
  `event.key === "b"` — but with Shift held, `event.key` is `"B"`, not `"b"`, so
  `cmd+shift+b` does **not** currently trigger `cmd+b`. That is luck, not design;
  it is one `toLowerCase()` away from breaking.
- **`cmd+shift+b` for a second sidebar is our own handler.** Recommended shape:
  edit our `sidebar.tsx` to take the shortcut as a prop, e.g.
  `shortcut?: { key: string; shift?: boolean }`, and match on
  `event.key.toLowerCase() === key && (event.metaKey || event.ctrlKey) && event.shiftKey === !!shift`.
  Handling shift explicitly on **both** providers is required, otherwise the
  left sidebar's `cmd+b` handler and the right's `cmd+shift+b` handler will
  disagree about what `event.key` is.

---

## 3. Calendar

**Exists**, and it wraps **`react-day-picker`, not Base UI.**
`https://ui.shadcn.com/r/styles/base-lyra/calendar.json`:

- `dependencies: ["react-day-picker@latest", "date-fns"]`
- `registryDependencies: ["button"]`
- `meta.links.api: "https://react-day-picker.js.org"`
- source imports `{ DayPicker, getDefaultClassNames, type DayButton, type Locale } from "react-day-picker"`

Docs: `https://ui.shadcn.com/docs/components/base/calendar.md` — "The `Calendar`
component is built on top of React DayPicker."

**Suitable as the small month date-picker at the top of a sidebar: yes.** The
canonical demo is exactly that:

```tsx
<Calendar mode="single" selected={date} onSelect={setDate}
          className="rounded-lg border" captionLayout="dropdown" />
```

It sizes off `[--cell-size:--spacing(7)]` on the root, so shrinking it for a
16rem sidebar is a one-variable override. It also declares
`in-data-[slot=popover-content]:bg-transparent`, i.e. it is designed to nest in a
`popover`. `mode="range"` exists if we ever want it, and `mode="single"` is what
ticket 01 needs.

Notes and one unverified risk:

- `react-day-picker@latest` currently resolves to **10.0.1** (npm). I confirmed
  v10 still exports `getDefaultClassNames` (`dist/esm/helpers/index.d.ts`) and
  `DayButton` (`dist/esm/components/custom-components.d.ts`), so the registry
  file's imports resolve. I did **not** run a typecheck against v10 — the docs'
  Persian-calendar section references `react-day-picker/persian`, which is *not*
  in v10's `exports` map, so at least one documented sub-path has moved. If the
  install misbehaves, pinning `react-day-picker@9` (latest 9.14.0) is the fallback.
- react-day-picker's peers are only `react >=16.8.0` and `@types/react` — React 19
  is fine.
- There is **no separate `date-picker` registry item** for `base-lyra`
  (`.../base-lyra/date-picker.json` → 404). The docs page
  `https://ui.shadcn.com/docs/components/base/date-picker.md` exists but describes
  a *composition* of `popover` + `calendar` + `button`, not an installable item.
- This is a date **picker** only. Ticket 01's week/month availability grid stays
  custom, as planned — nothing here changes that.

---

## 4. Blobatar's registry dependency — resolves cleanly

`https://blobatar.dev/r/avatar.json` (fetched in full):

```json
{
  "name": "avatar",
  "title": "Blobatar",
  "dependencies": ["blobatar", "@blobatar/react"],
  "registryDependencies": ["avatar"],
  "files": [{ "path": "registry/blobatar.tsx",
              "type": "registry:ui",
              "target": "components/ui/blobatar.tsx" }]
}
```

**Verdict: no Radix conflict.** Reasoning, from primary sources:

1. A **bare** name in `registryDependencies` means the built-in shadcn item:
   > "For `shadcn/ui` registry items such as `button`, `input`, `select`, etc use
   > the name … Bare names keep their existing behavior. `button` means the
   > built-in shadcn `button` item, not an item from the same GitHub repository."
   > — `https://ui.shadcn.com/docs/registry/registry-item-json.md`

   Blobatar's own registry says the same about this exact dependency:
   > "`sidebar` is shadcn's own, by bare name, so it resolves against whatever
   > registry the installing project has configured as its default."
   > — the `//registryDependencies` comment in `https://blobatar.dev/r/registry.json`

2. The default registry is style-aware via `components.json`'s `style`, and this
   project's `style` is `base-lyra`. `https://ui.shadcn.com/r/styles/base-lyra/avatar.json`
   imports `import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"`.
   **There is no Radix avatar to pull.**

3. The blobatar wrapper only ever touches the alias surface —
   `import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"` —
   and uses `<Avatar>`, `<AvatarImage src alt>`, `<AvatarFallback className>`. All
   three exist in the `base-lyra` avatar (which additionally exports `AvatarBadge`,
   `AvatarGroup`, `AvatarGroupCount`). The `AvatarFallback` gets
   `className="bg-transparent"` to defeat the base-lyra fallback's `bg-muted`,
   which is exactly the behaviour that file's comment describes.

4. One cosmetic wrinkle worth knowing: the blobatar item's **`name` is also
   `avatar`**, but its file `target` is `components/ui/blobatar.tsx`. Different
   targets, so the two files coexist and neither overwrites the other.

5. npm deps it adds: `blobatar` and `@blobatar/react`, deliberately unpinned
   (their `//dependencies` comment explains why: the two must resolve to a matched
   pair). Peers: `@blobatar/react` needs `blobatar: 2.x` and `react: >=18`;
   `blobatar` lists `react` and `vue` as peers but **both are marked optional**
   (`peerDependenciesMeta`), so a React-only install produces no warning.

### Recommended install order — do not run yet

```sh
# 1. base-lyra avatar first, so the shape of components/ui/avatar.tsx is known
#    before anything depends on it
npx shadcn@latest add avatar

# 2. eyeball src/components/ui/avatar.tsx — it must open with
#    import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
#    If it says @radix-ui/react-avatar, STOP: components.json style was ignored.

# 3. then the blobatar wrapper
npx shadcn@latest add https://blobatar.dev/r/avatar.json
```

Flags: **do not pass `--overwrite`.** Step 3 would re-resolve the bare `avatar`
dependency, and with `--overwrite` it rewrites `avatar.tsx`. It would rewrite it
with the same base-lyra file, so it is not fatal — but the habit is what loses a
local edit later. `src/components/ui/avatar.tsx` does not currently exist, so
step 1 has nothing to clobber.

Also on that registry, and relevant to us: **`password-field`**
(`registryDependencies: ["input"]`) for the ticket-01 signup form, and
`presence-avatar` (a blobatar with a presence dot and an unread badge, which is
close to the "silence is marked" muted dot).

---

## 5. Blobatar palette and expression — the critical item

### 5a. The decision survives — but ticket 01's wording is wrong

> **A blobatar does not have "a palette" in the sense ticket 01 assumes.**
> `palette` is not a named set you choose from. It is an *override* input:
> `Partial<Record<"bg" | "head" | "eye", string>>` — three optional hex strings.

Type, from the published `blobatar@2.7.0` declarations
(`https://unpkg.com/blobatar@2.7.0/dist/color.d.ts`):

```ts
/** Every color slot a blobatar has. */
export type ColorKey = "bg" | "head" | "eye";
export type Palette = Partial<Record<ColorKey, string>>;
```

And the option doc (`https://unpkg.com/blobatar@2.7.0/dist/render.d.ts`):

```ts
/** Overrides specific palette entries. Overridden colors bypass the contrast guarantee. */
palette?: Palette;
```

Confirmed independently by the README/llms.txt options table
(`https://blobatar.dev/llms.txt`): "`palette` — Per-key hex overrides. Bypasses
the contrast guarantee." It is **not** a query parameter on the HTTP endpoint at
all (`https://blobatar.dev/openapi.json` lists `size`, `s`, `background`, `hue`,
`tone`, `expression`, `title`, `gen` and the ignored Gravatar params — no
`palette`).

**What actually varies per friend is `hue` (0–360 degrees) and `tone` (a 0–1
position in a six-swatch set).** Everything else in the colour ramp is an
authored constant:

> "Hue is the only value the seed controls. Lightness and chroma are authored
> constants, which is what makes every blobatar look like it came from the same
> designer rather than from a random number generator."
> — header of `https://unpkg.com/blobatar@2.7.0/src/color.ts`

The tone set (same file), for sizing the design space:

```ts
const TONES: [number, { l: number; c: number }][] = [
  [0.2,  { l: 0.86, c: 0.085 }], // pastel
  [0.36, { l: 0.9,  c: 0.028 }], // pale neutral
  [0.62, { l: 0.73, c: 0.135 }], // mid
  [0.8,  { l: 0.62, c: 0.165 }], // deep
  [0.93, { l: 0.87, c: 0.16  }], // bright
  [1.0,  { l: 0.34, c: 0.035 }], // ink
];
```

### 5b. **YES — the colours are readable programmatically, publicly, and exactly.**

`blobatar`'s main entry exports the palette builder
(`https://unpkg.com/blobatar@2.7.0/dist/index.d.ts`):

```ts
export { palette, ramp, contrast, FLOORS,
         type Palette, type Oklch, type ColorKey } from "./color";
export { traits, type Traits, type TraitOverrides } from "./traits";
```

Signatures (`dist/color.d.ts`, bodies confirmed in `src/color.ts`):

```ts
/** The palette in OKLCh, before hex encoding. */
export declare function ramp(hue: number, enforce?: boolean, tone?: number): Record<string, Oklch>;
export declare function palette(hue: number, enforce?: boolean, tone?: number): Palette;
```

`palette()` returns **hex strings** — `toHex` is applied to every key. Colours are
resolved to hex rather than `oklch()` on purpose, because server-side rasterizers
do not support `oklch()` (same file's header).

**And the renderer resolves its own palette by exactly that call.** From
`https://unpkg.com/blobatar@2.7.0/src/render.ts`:

```ts
palette: {
  ...buildPalette(
    opts.hue  ?? t.num("hue", 0, 360),
    opts.contrast ?? true,
    opts.tone ?? t("tone"),
  ),
  ...opts.palette,
} as Palette,
```

`t` there is `traits(name)`, and **`traits` is a public export**. So we can
reproduce the renderer's own colours, for any friend, with public API only:

```ts
import { traits, palette } from "blobatar";

/** The exact colours the friend's blobatar is drawn in. */
export function blobatarColors(name: string, opts?: { hue?: number; tone?: number }) {
  const t = traits(name);                       // same hash the renderer uses
  const hue  = opts?.hue  ?? t.num("hue", 0, 360);
  const tone = opts?.tone ?? t("tone");
  return palette(hue, true, tone);              // { bg, head, eye } as hex
}
```

`head` is the body fill — that is the colour to derive an availability block
from. `eye` is the guaranteed-4.5:1 contrast partner, which is a free, correct
foreground colour for text drawn on a block. `bg` is the light backdrop swatch.

Two further routes, for completeness:

- **`_layout(name, opts).palette`** returns the resolved `Palette` for a name
  including any overrides, and it is reachable through the `blobatar/internal`
  entry point (`https://unpkg.com/blobatar@2.7.0/dist/internal.d.ts`). That entry
  point's own contract says it is **for the `@blobatar/*` adapters**, changes only
  on a major, and "Nothing here is needed to render a blobatar." Usable, but it is
  the adapter seam, not ours. Prefer `traits` + `palette`.
- **`ramp(hue, true, tone)`** gives the same colours as `{l, c, h}` OKLCh objects
  before hex encoding — which is the better input for the mesh gradient and glow
  work in ticket 01, since mixing in OKLab is what the library itself does
  (`mix`, `mixHex` in `color.ts`, though those two are *not* re-exported from the
  main entry — they are internal to `./color`).

**Stability caveat, stated plainly.** `llms.txt` says trait names "are not
enumerated here on purpose". `hue` and `tone` are the exception: they are
documented options in their own right, and the docs explicitly relate them to the
trait keys — "Overlaps with `hue` and `tone`, which state the same two traits in
friendlier units. Those win: `hue` is degrees, `traits.hue` is a 0–1 position"
(`dist/render.d.ts`). The key namespace is append-only and the ranges are frozen
per major, so `t.num("hue", 0, 360)` is stable **within `blobatar@2`**. A move to
`blobatar@3` is a new generation: every friend's face *and* colour changes. That
is by design (their ADR-0008) and is a product decision we would be opting into,
not a regression.

**Best practice given onboarding step 2.** Ticket 01 already has a blobatar
customisation step. If we persist the customisation as `{ hue, tone, traits }`
per friend — which is what the editor at `https://blobatar.dev/editor` is for —
then `palette(hue, true, tone)` needs no trait reader at all and is 100% public
API, insulated from key-name questions entirely. **Recommendation: store `hue`
and `tone` explicitly on the Friend row.** It makes the colour derivation a pure
function of two stored numbers, survives a generation bump, and lets a friend
retune their colour without their block colour silently changing under a hash.

### 5c. `expression` — the exact valid values

Fourteen poses. In the **packages** they are **imported as values, not passed as
strings**:

```tsx
import { happy, idle } from "blobatar/expression";
<Blobatar name={user.email} animate="always" expression={happy} size={64} />
```

The roster (`https://blobatar.dev/llms.txt`, and the same list as an enum in
`https://blobatar.dev/openapi.json`):

`idle` (default, byte-identical to omitting), `happy`, `sad`, `mad`, `surprised`,
`wink`, `sleepy`, `smug`, `unsure`, `scared`, `love`, `shy`, `sick`, `thinking`.

- Over **HTTP** they are plain strings — `?expression=happy` — with that exact
  enum in the OpenAPI spec.
- In **React** the prop is typed `expression?: Expression`, an object, so a string
  will not typecheck. This trips people; note it in any UI ticket.
- Expressions are a **state you hold**, not an event: nothing returns to `idle` on
  its own, no timers.
- Independent of `animate` in both directions. Without `animate` you get the pose
  statically; the *morph between* poses needs `animate`.
- Four poses tint the palette — `mad`, `love`, `shy`, `sick`. **This matters for
  us:** a tinting pose changes the rendered `head`/`eye` colours away from what
  `palette(hue, …)` returns. If we ever set an expression on a friend's avatar, the
  avatar and its availability block will disagree on colour. Keep expressions off
  the identity avatar, or restrict to the ten untinted poses.
- `thinking` keeps moving with `blobatar/motion.css` loaded — a two-dot loader.

### 5d. Rendering-mode gotcha worth costing now

`animate` changes the DOM shape: a static blobatar is a single `<img>`; an
animated one is inline SVG, ~a dozen nodes.

> "A list of 400 blobatars is exactly the case the `<img>` default was chosen for."
> — `https://blobatar.dev/llms.txt`

Ticket 01 has blobatars in grid cells on hover, in candidate rows, and on
hangouts. **Keep those static** (`<img>`, no `animate`), and reserve
`animate="always"` for the profile/onboarding header.

This also kills one of the workarounds: the `--mo-head` / `--mo-eye` custom
properties that carry the resolved colours are only present in the **inline SVG**
path. Content inside an `<img>` is an isolated document, so `getComputedStyle`
cannot reach a static blobatar's colours. Read the colours from `palette()`, not
from the DOM.

### 5e. If §5b had failed — the workarounds, for the record

Not needed, but recorded so nobody re-derives them:

1. **Parallel hardcoded map.** Would have meant duplicating the six-swatch `TONES`
   table and the OKLCh→hex conversion in our code, then keeping it in sync with a
   library whose whole contract is that those numbers are frozen per major. Ugly
   but viable.
2. **Read computed styles off a rendered avatar.** Only works with
   `animate` on (inline SVG), which forces the expensive rendering mode across the
   whole grid. Rejected on that basis.
3. **Fetch and parse the SVG from the HTTP endpoint.** `GET /avatar/<name>` returns
   SVG with hex `fill`s inline; a regex would recover them. A network round trip
   per friend to learn a colour we can compute locally.

All three are moot. `traits` + `palette` is the answer.

---

## 6. dropdown-menu, select, popover, tooltip, dialog

All five exist for `base-lyra` and all five are Base UI.

| item | status here | primitive |
| --- | --- | --- |
| `dropdown-menu` | **installed** (`src/components/ui/dropdown-menu.tsx`) | `@base-ui/react/menu` |
| `select` | **installed** (`src/components/ui/select.tsx`) | `@base-ui/react/select` |
| `popover` | installable, 200 | `@base-ui/react/popover` |
| `tooltip` | installable, 200 | `@base-ui/react/tooltip` |
| `dialog` | installable, 200 (`registryDependencies: ["button"]`) | `@base-ui/react/dialog` |

Also relevant and confirmed available: `sheet` (Base UI dialog — the sidebar's
mobile drawer), `skeleton`, `use-mobile`, `scroll-area`, `toggle-group`.

Naming note for anyone writing tickets: this style's dropdown is Base UI's
**Menu**, not Radix's DropdownMenu. Subcomponent names and props follow Base UI —
read `https://base-ui.com/react/components/menu` (each registry item's
`meta.links.api` points at the matching `base-ui.com/react/components/<x>.md`),
not the Radix docs, before specifying behaviour.

---

## Consequences for friens-cal

Against `.scratch/shared-availability-calendar/issues/01-destination-and-scope.md`.

### 1. Item 5 — the palette decision **stands**, with a required wording change

> "A Friend's **block colour derives from their blobatar palette**" — ticket 01

**This holds.** But "palette" in blobatar means *hex overrides you pass in*, not
*a named set the friend picked*. Rewrite the decision as:

> A Friend's block colour is `palette(hue, true, tone).head`, where `hue` and
> `tone` are the two colour axes of their blobatar, stored on the Friend row at
> onboarding.

Concrete follow-ups this creates:

- **The data model (ticket 07) needs `hue: number` and `tone: number` columns on
  Friend**, not a `palette: string` enum. Persisting the customisation as
  `{ hue, tone, traits }` keeps colour derivation on 100% public API and makes it
  a pure function of two stored numbers.
- **The composite rendering prototype (ticket 05) gets its input for free.** Use
  `ramp(hue, true, tone)` for OKLCh objects when building the mesh gradient and
  the all-friends glow, rather than parsing hex and converting.
- **`eye` is a free, contrast-guaranteed foreground.** The library verifies eye vs.
  head at ≥4.5:1 at every hue and tone. Any label drawn on an availability block
  can use it instead of us solving contrast ourselves.
- **Do not set a tinting expression (`mad`, `love`, `shy`, `sick`) on the identity
  avatar** — it moves the rendered colours off the stored palette and desyncs the
  avatar from its blocks.
- **Colour collisions are now a live design question.** Hue is a continuous 0–360
  and tone lands in one of six swatches. Two friends can land visually adjacent.
  Ticket 01 says "no legend is needed to read the grid" — that assumes distinct
  colours. Onboarding step 2 should either show taken hues or nudge new friends
  away from them. **This is new work ticket 01 did not scope.**

### 2. Two sidebars are ours to build, not ours to configure

Ticket 01's layout assumes a left sidebar (month picker, friends) and a right
sidebar (candidates, pinned hangouts). `side="left"` and `side="right"` both
render correctly, but **one `SidebarProvider` = one open state**. Independent
toggling means either nested providers (three collisions: shared `cmd+b`, shared
`sidebar_state` cookie, nested flex wrappers) or a fork of `sidebar.tsx`. Budget
a small amount of real work for this in the layout ticket; it is not a prop.

### 3. `cmd+shift+b` is a hand-written handler

No prop, no config. The shortcut is a module constant and a `useEffect` in the
copied file. Any ticket that promises a second shortcut is promising an edit to
`src/components/ui/sidebar.tsx`.

### 4. The sidebar cookie is inert in a Vite SPA

`sidebar_state` is written on every toggle and read by nothing — the upstream
design assumes a server component reads it for `defaultOpen`. Ticket 01 says view
state is deliberately ephemeral ("not persisted at all, not even to
`localStorage`"). The cookie write contradicts that in spirit, is dead code here,
and should be deleted from our copy.

### 5. No decision is invalidated by items 1, 3, 4 or 6

- `sidebar`, `calendar`, `avatar`, `popover`, `tooltip`, `dialog`, `sheet` all
  exist for `base-lyra`, all Base UI (except `calendar`, react-day-picker).
- The blobatar install pulls **no Radix**. Order: `avatar` first, then
  `https://blobatar.dev/r/avatar.json`, no `--overwrite`.
- `calendar` is fine as the small month picker; the availability grid stays custom.

### 6. Two smaller finds worth a ticket each

- **`password-field`** at `https://blobatar.dev/r/password-field.json`
  (`registryDependencies: ["input"]`) covers ticket 01's email+password signup
  form and reset flow.
- **`presence-avatar`** at `https://blobatar.dev/r/presence-avatar.json` is a
  blobatar with a presence dot and an unread badge — close enough to ticket 01's
  "silence is marked: a muted dot beside Friends with zero Availability" that it
  is worth looking at before building one.

### Not confirmed

- No shadcn docs page names `base-lyra`; its existence rests on the registry
  endpoints, not prose.
- No upstream example mounts two independently-toggled sidebars; I did not
  exhaustively search `https://ui.shadcn.com/blocks`.
- I did not typecheck the `base-lyra` calendar against `react-day-picker@10.0.1`.
  Its imports resolve against v10's declarations; `react-day-picker@9` (9.14.0) is
  the fallback if the install misbehaves.
- `https://blobatar.dev/editor` is client-rendered and returned no static text, so
  what it emits (trait map? `hue`/`tone`? hex?) is **unverified**. The library API
  above makes the answer moot for our purposes, but if onboarding step 2 is going
  to embed or mimic that editor, open it in a browser before speccing it.
