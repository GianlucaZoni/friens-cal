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
      Not a third tab, on purpose. Erase is not a third geometry — it is the
      other thing either geometry can do, and a drag still has to start inside a
      block for it to mean anything. `aria-pressed` carries the state; the tint
      is `toggleVariants`' own.
    */}
    <div className="px-2 pt-2">
      <Toggle
        variant="outline"
        size="sm"
        className="w-full justify-start"
        pressed={tools.erasing}
        onPressedChange={tools.setErasing}
        title="Drag inside a block to take that span out"
      >
        <EraserIcon /> Erase
      </Toggle>
    </div>
  </SidebarGroup>
)
