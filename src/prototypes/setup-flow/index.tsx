/**
 * PROTOTYPE — ticket 18: setup flow and profile editing. THROWAWAY.
 * Do not promote to production; rewrite properly when folding in.
 *
 * Five screens, not five variants: ticket 11 already decided what step 2
 * *contains*, and ticket 13 already deleted the screens that are gone. What was
 * open is the arrangement, and the two pieces of copy that are the human's to
 * pick — so `?screen=` walks the flow and `?copy=` cycles the drafts in place.
 *
 * Wire up:
 *   <Route path="/prototype/setup-flow" element={<SetupFlowPrototype />} />
 *
 * Or open `preview.html` in this directory — no build step, no dev server.
 */
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FORGOT_COPY, REJECT_COPY, type ForgotCopyKey, type RejectCopyKey } from './copy'
import { TAKEN_HUES, materialise, type Identity } from './identity'
import { ProfileMenu, SignIn, SignUp, StepOne, StepTwo } from './screens'

const SCREENS = ['signin', 'signup', 'step1', 'step2', 'profile'] as const
type ScreenKey = (typeof SCREENS)[number]

const SCREEN_NAMES: Record<ScreenKey, string> = {
  signin: 'Sign in',
  signup: 'Sign up + rejection',
  step1: 'Step 1 — name & blob',
  step2: 'Step 2 — customise',
  profile: 'Profile dropdown',
}

/** Which screens have a copy decision riding on them. */
const HAS_COPY: Record<ScreenKey, boolean> = {
  signin: true,
  signup: true,
  step1: false,
  step2: false,
  profile: false,
}

const COPY_KEYS = ['A', 'B', 'C'] as const

export const SetupFlowPrototype = () => {
  const [params, setParams] = useSearchParams()

  const screen = (
    SCREENS.includes(params.get('screen') as ScreenKey) ? params.get('screen') : 'signin'
  ) as ScreenKey
  const copyKey = (
    COPY_KEYS.includes(params.get('copy') as 'A') ? params.get('copy') : 'A'
  ) as 'A' | 'B' | 'C'
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'

  const [identity, setIdentity] = useState<Identity>(() => materialise(TAKEN_HUES))
  const [displayName, setDisplayName] = useState('')

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  const index = SCREENS.indexOf(screen)
  const go = (delta: number) => set('screen', SCREENS[(index + delta + SCREENS.length) % SCREENS.length]!)
  const cycleCopy = () =>
    set('copy', COPY_KEYS[(COPY_KEYS.indexOf(copyKey) + 1) % COPY_KEYS.length]!)

  /* The prototype paints its own surface so both themes can be judged without
     touching the app shell. `.dark` is what `@custom-variant dark` keys off. */
  useEffect(() => {
    const root = document.documentElement
    const had = root.classList.contains('dark')
    root.classList.toggle('dark', theme === 'dark')
    return () => {
      root.classList.toggle('dark', had)
    }
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'c' && HAS_COPY[screen]) cycleCopy()
      if (e.key === 't') set('theme', theme === 'dark' ? 'light' : 'dark')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const body = useMemo(() => {
    switch (screen) {
      case 'signin':
        return <SignIn copyKey={copyKey as ForgotCopyKey} />
      case 'signup':
        return <SignUp copyKey={copyKey as RejectCopyKey} />
      case 'step1':
        return (
          <StepOne
            identity={identity}
            displayName={displayName}
            onName={setDisplayName}
            onRandomise={() => setIdentity(materialise(TAKEN_HUES))}
            theme={theme}
          />
        )
      case 'step2':
        return (
          <StepTwo
            identity={identity}
            setIdentity={setIdentity}
            theme={theme}
            displayName={displayName}
          />
        )
      case 'profile':
        return (
          <ProfileMenu
            identity={identity}
            setIdentity={setIdentity}
            theme={theme}
            displayName={displayName}
          />
        )
    }
  }, [screen, copyKey, identity, displayName, theme])

  const copyName = HAS_COPY[screen]
    ? screen === 'signin'
      ? FORGOT_COPY[copyKey as ForgotCopyKey].name
      : REJECT_COPY[copyKey as RejectCopyKey].name
    : null

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background pb-24 text-foreground">
        {body}

        {import.meta.env.MODE !== 'production' && (
          <div style={bar}>
            <button onClick={() => go(-1)} style={pill} aria-label="previous screen">
              ←
            </button>
            <span style={{ padding: '0 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {index + 1}/5 · {SCREEN_NAMES[screen]}
            </span>
            <button onClick={() => go(1)} style={pill} aria-label="next screen">
              →
            </button>
            <span style={divider} />
            {copyName ? (
              <button onClick={cycleCopy} style={{ ...pill, width: 'auto', padding: '0 10px' }}>
                copy {copyKey} · {copyName}
              </button>
            ) : (
              <span style={{ padding: '0 8px', opacity: 0.45, whiteSpace: 'nowrap' }}>
                no copy decision here
              </span>
            )}
            <span style={divider} />
            <button
              onClick={() => set('theme', theme === 'dark' ? 'light' : 'dark')}
              style={{ ...pill, width: 'auto', padding: '0 10px' }}
            >
              {theme}
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

const bar: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: '#111',
  color: '#fff',
  borderRadius: 999,
  padding: 4,
  boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  zIndex: 50,
}

const pill: CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: 0,
  borderRadius: 999,
  height: 26,
  width: 26,
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
}

const divider: CSSProperties = {
  width: 1,
  height: 18,
  background: 'rgba(255,255,255,0.2)',
  margin: '0 2px',
}

export default SetupFlowPrototype
