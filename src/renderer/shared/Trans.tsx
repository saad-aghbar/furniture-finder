import { Fragment, type ReactNode } from 'react'
import type { MessageKey } from '@shared/i18n'
import { useApp } from './AppProvider'

/** Translate a message whose placeholders are React nodes (e.g. animated numbers). */
export function Trans({ k, values }: { k: MessageKey; values: Record<string, ReactNode> }): ReactNode {
  const { t } = useApp()
  const marks: Record<string, string> = {}
  for (const name of Object.keys(values)) marks[name] = `\u0001${name}\u0001`
  const parts = t(k, marks).split('\u0001')
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{i % 2 === 1 ? values[p] : p}</Fragment>
      ))}
    </>
  )
}
