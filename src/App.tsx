import { CompositorLossReadout } from '@/availability/compositor-loss-readout'
import { AppRoutes } from '@/pages/AppRoutes'

export const App = () => {
  return (
    <>
      <AppRoutes />
      {/*
        Outside the router on purpose: the instrument it reads is a module-level
        Set in `touch.ts` that survives navigation, and a loss reported on the
        week grid is still the answer to issue 15 after you have paged to the
        month. It renders nothing at all unless the URL says `?touchlog`.
      */}
      <CompositorLossReadout />
    </>
  )
}
