/**
 * PROTOTYPE — ticket 12. THROWAWAY.
 *
 * Three shells. They differ in exactly the thing item 5 asks about — WHERE THE
 * TOP BAR LIVES relative to the two panes — and everything downstream of that:
 * where the pane triggers go, where the top-right cluster sits, and what the
 * panes look like when they are the full height of the window versus not.
 *
 * The state mechanism (one provider, two panes, one keyboard listener, one
 * sheet) is identical in all three. That is deliberate: it is settled, and
 * these variants exist to judge the layout on top of it.
 */
import { BarTitle, GridStub, LeftPane, RightPane, TopCluster, type View } from './parts'
import { AppShellProvider, ShellInset, ShellSidebar, ShellTrigger } from './shell'

export type VariantProps = {
  view: View
  onView: (v: View) => void
  dark: boolean
  onDark: (v: boolean) => void
}

const LABEL = '31 Aug – 6 Sep 2026'

/** Shared by all three: the tokens ticket 11 settled, as two constants per theme. */
const TOKENS =
  '[--friend-l:0.62] [--friend-c:0.15] [--friend-wash:0.16] ' +
  'dark:[--friend-l:0.78] dark:[--friend-c:0.145] dark:[--friend-wash:0.24]'

/* ================================================================== */
/* A — Inset bar. The bar belongs to the calendar and nothing else.    */
/* ================================================================== */

export function VariantAInset(p: VariantProps) {
  return (
    <AppShellProvider className={TOKENS}>
      <div className="flex min-h-0 flex-1">
        <ShellSidebar side="left">
          <LeftPane />
        </ShellSidebar>

        <ShellInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
            <ShellTrigger side="left" />
            <BarTitle label={LABEL} className="mx-1 flex-1" />
            <TopCluster {...p} label={LABEL} />
            <ShellTrigger side="right" />
          </header>
          <GridStub view={p.view} />
        </ShellInset>

        <ShellSidebar side="right">
          <RightPane />
        </ShellSidebar>
      </div>
    </AppShellProvider>
  )
}

/* ================================================================== */
/* B — Banner. One bar across the whole window, panes hang below it.   */
/* ================================================================== */

export function VariantBBanner(p: VariantProps) {
  return (
    <AppShellProvider className={TOKENS}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-2">
        <ShellTrigger side="left" />
        <span className="ml-1 hidden text-sm font-semibold sm:inline">friens</span>
        <BarTitle label={LABEL} className="mx-2 flex-1" />
        <TopCluster {...p} label={LABEL} />
        <ShellTrigger side="right" />
      </header>
      <div className="flex min-h-0 flex-1">
        <ShellSidebar side="left">
          <LeftPane />
        </ShellSidebar>
        <ShellInset>
          <GridStub view={p.view} />
        </ShellInset>
        <ShellSidebar side="right">
          <RightPane />
        </ShellSidebar>
      </div>
    </AppShellProvider>
  )
}

/* ================================================================== */
/* C — Reference. Left pane full height; bar spans centre AND right.   */
/* ================================================================== */

export function VariantCReference(p: VariantProps) {
  return (
    <AppShellProvider className={TOKENS}>
      <div className="flex min-h-0 flex-1">
        <ShellSidebar side="left">
          {/* Full-height pane, so it carries the product mark itself. */}
          <LeftPane
            withHeader={
              <div className="flex items-center gap-2">
                <ShellTrigger side="left" />
                <span className="text-sm font-semibold">friens</span>
              </div>
            }
          />
        </ShellSidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
            <BarTitle label={LABEL} className="mx-1 flex-1" />
            <TopCluster {...p} label={LABEL} showPaneTriggers />
          </header>
          <div className="flex min-h-0 flex-1">
            <ShellInset>
              <GridStub view={p.view} />
            </ShellInset>
            <ShellSidebar side="right">
              <RightPane />
            </ShellSidebar>
          </div>
        </div>
      </div>
    </AppShellProvider>
  )
}
