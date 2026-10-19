import { Minus, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import iconUrl from '../../../resources/icon.png'
import { useApp } from './AppProvider'
import w from './window.module.css'

/** Frameless window shell: drag-able title bar with minimise / close, then the content. */
export function WindowChrome({ title, children }: { title: string; children: ReactNode }): ReactNode {
  const { t } = useApp()
  useEffect(() => {
    document.documentElement.dataset['platform'] = window.ff.platform
    document.title = title
  }, [title])
  return (
    <div className={w.frame}>
      <header className={w.titlebar}>
        <img src={iconUrl} alt="" />
        <span className={w.titleText}>{title}</span>
        <div className={w.winButtons}>
          <button type="button" className={w.winButton} onClick={() => void window.ff.invoke('window:minimize')} aria-label={t('common.minimize')} title={t('common.minimize')}>
            <Minus size={18} strokeWidth={1.75} />
          </button>
          <button type="button" className={`${w.winButton} ${w.winClose}`} onClick={() => void window.ff.invoke('window:close')} aria-label={t('common.close')} title={t('common.close')}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>
      <div className={w.body}>{children}</div>
    </div>
  )
}
