import type { DrawingMode } from '@/availability/gesture'
import type { DrawingTools } from '@/availability/use-drawing-tools'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { SidebarGroup, SidebarGroupLabel } from '@/shell/shell'
import { EraserIcon } from 'lucide-react'

/**
 * The two controls that say what a drag means, in the left pane.
 *
 * **Ticket 01's corrections put them here**, and ticket 17 confirms it for the
 * phone, where this pane is a sheet. That is a real cost — a mode you must open
 * a drawer to change will not get used much on a phone — and it was weighed:
 * ticket 10 asked to move this chrome onto the grid and was answered by keeping
 * it in the pane and making the *gestures* not need it (a bare click reads, a
 * drag draws, and erase is the only mode you have to reach for).
 *
 * A tabbar for the mode and a toggle for erase, exactly as ticket 01 names them
 * — "a Drawing mode: tab bar" with Linear and Multi-day, and an erase drag
 * "toggleable from the left sidebar".
 */
export const DrawingControls = ({ tools }: { tools: DrawingTools }) => (
  <SidebarGroup>
    <SidebarGroupLabel>Drawing mode:</SidebarGroupLabel>

    {/*
      Base UI's `Tabs` with no `Tabs.Panel` anywhere: what these tabs switch is
      the grid in the centre column, which is not inside them and cannot be. The
      root still owns the value and the roving focus, which is the whole reason
      to use it rather than two buttons.
    */}
    <Tabs
      value={tools.mode}
      onValueChange={(value) => tools.setMode(value as DrawingMode)}
      className="px-2"
    >
      <TabsList className="w-full">
        <TabsTrigger
          value="linear"
          title="One continuous run through the week — a drag crosses midnight"
        >
          Linear
        </TabsTrigger>
        <TabsTrigger value="multi-day" title="The same hours on every day you drag across">
          Multi-day
        </TabsTrigger>
      </TabsList>
    </Tabs>

    {/*
      Not a third tab, on purpose. Erase is not a third geometry: it is the
      other thing either geometry can do, and a drag still has to start inside a
      block for it to mean anything.

      `aria-pressed` carries the state, and **issue 15 found that state was
      unreadable**. `toggleVariants` tints a pressed toggle `bg-muted`, which is
      `oklch(0.97 0 0)` sitting on an `oklch(0.985 0 0)` sidebar: 1.5% of
      lightness at zero chroma, which on a phone in daylight is nothing at all.
      It then uses that *same* `bg-muted` for `hover:`, so on a desktop an
      un-pressed toggle under the cursor is pixel-identical to a pressed one.
      The verification run read the control as broken on touch and it was not;
      it was working silently, which is its own kind of broken.

      So this one paints itself `--destructive` when it is on. That is already
      the colour of an erase drag everywhere else it appears (issue 13: the
      armed ring and the draft's tag both go `oklch(0.58 0.22 27)`), and this is
      the only mode in the app where a drag takes something away. The `hover:`
      pairs are scoped to `aria-pressed` too, or the base `hover:bg-muted` would
      grey the red out under a cursor.

      **The label goes dark rather than white in dark mode**, because
      `--destructive` inverts there. Measured off the rasterised tokens: white
      on the light theme's `oklch(0.58 0.22 27)` is **4.78:1** and passes AA,
      but white on dark's far lighter `oklch(0.704 0.191 22.216)` is **2.89:1**
      and does not. The near-black `--background` on that same red is
      **6.85:1**. (Nothing in the app adds `.dark` to the document yet, so that
      branch is measured from the tokens rather than seen on screen.)
    */}
    <div className="px-2 pt-2">
      <Toggle
        variant="outline"
        size="sm"
        className="w-full justify-start aria-pressed:border-destructive aria-pressed:bg-destructive aria-pressed:text-white aria-pressed:hover:bg-destructive/90 aria-pressed:hover:text-white dark:aria-pressed:text-background dark:aria-pressed:hover:text-background"
        pressed={tools.erasing}
        onPressedChange={tools.setErasing}
        title={
          tools.erasing
            ? 'Erasing: drag inside a block to take that span out'
            : 'Drag inside a block to take that span out'
        }
      >
        <EraserIcon /> Erase
      </Toggle>
    </div>
  </SidebarGroup>
)
