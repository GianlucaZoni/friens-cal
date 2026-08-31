import { useState } from 'react'

/**
 * One save, its in-flight flag, and the message to show if it failed.
 *
 * Every write in this feature has the identical shape — disable the controls,
 * clear the last error, await, then either move on or surface a sentence — and
 * it was written out four times before this existed. Four copies of a
 * three-state machine is four chances for one of them to leave `saving` stuck
 * on after a failure, which is a permanently disabled dialog.
 *
 * `run` takes the write itself, so the caller decides what "saved" means:
 * setup's step 1 advances a step, the dialogs close.
 */
export const useSaveAction = () => {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const run = async (write: () => Promise<string | null>, onSaved: () => void) => {
    setSaving(true)
    setError(null)
    const message = await write()
    setSaving(false)
    if (message) setError(message)
    else onSaved()
  }

  return { error, saving, setError, run }
}
