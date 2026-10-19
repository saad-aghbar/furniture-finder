import { AnimatePresence, motion, useAnimate, type Variants } from 'motion/react'
import { AlertTriangle, Check, ClipboardCheck, FileSpreadsheet, Folder, FolderPlus, FilePlus, Move, Search, UploadCloud, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { AddSourcesResult } from '@shared/ipc'
import type { FileErrorKey, FileStatus, IndexProgress, Lang, SourceInfo } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { useApp, useFFEvent } from '../shared/AppProvider'
import { AnimatedNumber } from '../shared/AnimatedNumber'
import { Trans } from '../shared/Trans'
import { WindowChrome } from '../shared/WindowChrome'
import { dur, ease, fade, shake, shakeTransition, spring } from '../motion/tokens'
import { Confetti } from './Confetti'
import w from '../shared/window.module.css'
import s from './onboarding.module.css'

type Step = 'language' | 'files' | 'indexing' | 'done'
const ORDER: Step[] = ['language', 'files', 'indexing', 'done']
const LANGS: { id: Lang; name: string; glyph: string }[] = [
  { id: 'ar', name: 'العربية', glyph: 'ع' },
  { id: 'he', name: 'עברית', glyph: 'א' },
  { id: 'en', name: 'English', glyph: 'A' }
]
const EMPTY: IndexProgress = { running: false, filesTotal: 0, filesDone: 0, rowsIndexed: 0, currentFile: null, errors: [] }

/** "C:\Users\dad\Documents\Prices" → "…\Documents\Prices" */
function shortPath(p: string): string {
  const sep = p.includes('\\') ? '\\' : '/'
  const parts = p.split(sep).filter(Boolean)
  return parts.length <= 3 ? p : `…${sep}${parts.slice(-3).join(sep)}`
}
const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export default function OnboardingApp(): ReactNode {
  const { t, dir, reduceMotion } = useApp()
  const initialMode = new URLSearchParams(location.search).get('mode') === 'manage' ? 'manage' : 'first-run'
  const [mode, setMode] = useState<'first-run' | 'manage'>(initialMode)
  const [step, setStep] = useState<Step>(initialMode === 'manage' ? 'files' : 'language')
  const [direction, setDirection] = useState(1)

  useFFEvent(
    'onboarding:mode',
    useCallback((m: 'first-run' | 'manage') => {
      setMode(m)
      if (m === 'manage') setStep('files')
    }, [])
  )

  const go = (next: Step): void => {
    setDirection(ORDER.indexOf(next) > ORDER.indexOf(step) ? 1 : -1)
    setStep(next)
  }
  const finish = (): void => void window.ff.invoke('app:onboarding-done')

  // Shared-axis slide; horizontal direction follows the reading direction.
  const sign = dir === 'rtl' ? -1 : 1
  const variants: Variants = reduceMotion
    ? { enter: { opacity: 0 }, center: { opacity: 1, transition: fade }, exit: { opacity: 0, transition: fade } }
    : {
        enter: (d: number) => ({ x: 24 * d * sign, opacity: 0 }),
        center: { x: 0, opacity: 1, transition: { ...spring.gentle, opacity: { duration: dur.md, ease: ease.out } } },
        exit: (d: number) => ({ x: -24 * d * sign, opacity: 0, transition: { duration: dur.sm, ease: ease.out } })
      }

  const title = mode === 'manage' ? t('onboarding.manageTitle') : t('app.name')

  return (
    <WindowChrome title={title}>
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div key={`${mode}-${step}`} className={s.page} custom={direction} variants={variants} initial="enter" animate="center" exit="exit">
          {step === 'language' && <LanguageStep onNext={() => go('files')} />}
          {step === 'files' && <FilesStep mode={mode} onBack={() => go('language')} onNext={() => go('indexing')} />}
          {step === 'indexing' && <IndexingStep onDone={() => go('done')} onStartNow={finish} />}
          {step === 'done' && <DoneStep onFinish={finish} />}
        </motion.div>
      </AnimatePresence>
    </WindowChrome>
  )
}

function Dots({ step }: { step: Step }): ReactNode {
  const { t } = useApp()
  const n = ORDER.indexOf(step) + 1
  return (
    <div className={s.dots} role="img" aria-label={t('onboarding.step', { n, total: ORDER.length })}>
      {ORDER.map((st) => (
        <span key={st} className={s.dot} data-on={st === step} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function LanguageStep({ onNext }: { onNext: () => void }): ReactNode {
  const { t, settings, update, reduceMotion } = useApp()
  return (
    <>
      <div className={s.content}>
        <h1 className={w.h1}>{t('onboarding.welcomeTitle')}</h1>
        <p className={w.lead}>{t('onboarding.langTitle')}</p>
        <div className={s.langGrid} role="radiogroup" aria-label={t('onboarding.langTitle')}>
          {LANGS.map((l) => {
            const on = settings.language === l.id
            return (
              <button key={l.id} type="button" role="radio" aria-checked={on} className={s.langButton} onClick={() => void update({ language: l.id })} lang={l.id} dir={l.id === 'en' ? 'ltr' : 'rtl'}>
                <span className={s.langGlyph} aria-hidden>
                  {l.glyph}
                </span>
                <span className={s.langName}>{l.name}</span>
                <AnimatePresence>
                  {on && (
                    <motion.span
                      className={s.langCheck}
                      initial={{ scale: reduceMotion ? 1 : 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                      transition={reduceMotion ? fade : spring.snappy}
                    >
                      <Check size={18} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )
          })}
        </div>
        <p className={w.muted}>{t('onboarding.langHint')}</p>
      </div>
      <div className={s.footer}>
        <Dots step="language" />
        <div className={s.footerEnd}>
          <button type="button" className={w.primary} onClick={onNext} autoFocus>
            {t('common.next')}
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function useSources(): [SourceInfo[], (list: SourceInfo[]) => void] {
  const [sources, setSources] = useState<SourceInfo[]>([])
  useEffect(() => {
    void window.ff.invoke('sources:list').then(setSources)
  }, [])
  useFFEvent('sources:changed', setSources)
  return [sources, setSources]
}

function useProgress(): IndexProgress {
  const [p, setP] = useState<IndexProgress>(EMPTY)
  useEffect(() => {
    void window.ff.invoke('index:progress').then(setP)
  }, [])
  useFFEvent('index:progress', setP)
  return p
}

function useErrors(progress: IndexProgress): FileStatus[] {
  const [errors, setErrors] = useState<FileStatus[]>([])
  const load = useCallback(() => void window.ff.invoke('index:errors').then(setErrors), [])
  useEffect(() => {
    if (!progress.running) load()
  }, [progress.running, load])
  useFFEvent('index:changed', load)
  return errors
}

function ErrorList({ errors }: { errors: FileStatus[] }): ReactNode {
  const { t } = useApp()
  if (errors.length === 0) return null
  return (
    <ul className={w.errorList}>
      {errors.map((e) => (
        <li key={e.path} className={w.errorItem}>
          <AlertTriangle size={20} strokeWidth={1.75} aria-hidden />
          <div>
            <div className={w.errorName}>
              <bdi dir="ltr">{e.name}</bdi>
            </div>
            <div className={w.errorText}>{t(`errors.${(e.error ?? 'corrupt') as FileErrorKey}` as MessageKey)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function FilesStep({ mode, onBack, onNext }: { mode: 'first-run' | 'manage'; onBack: () => void; onNext: () => void }): ReactNode {
  const { t, reduceMotion } = useApp()
  const [sources] = useSources()
  const progress = useProgress()
  const errors = useErrors(progress)
  const [over, setOver] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const depth = useRef(0)
  const [dropScope, animateDrop] = useAnimate<HTMLDivElement>()
  const [iconScope, animateIcon] = useAnimate<HTMLSpanElement>()

  const totals = useMemo(
    () => ({ files: sources.reduce((a, x) => a + x.fileCount, 0), skipped: sources.reduce((a, x) => a + x.skippedCount, 0) }),
    [sources]
  )

  const report = (res: AddSourcesResult): void => {
    const msgs = [
      ...res.alreadyCovered.map((p) => t('onboarding.alreadyAdded', { name: baseName(p) })),
      ...res.rejected.map((p) => t('onboarding.notExcel', { name: baseName(p) }))
    ]
    setMessage(msgs.length ? msgs.join('\n') : null)
    if (msgs.length && !reduceMotion && dropScope.current) void animateDrop(dropScope.current, shake, shakeTransition)
  }

  const add = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    try {
      report(await window.ff.invoke('sources:add', paths))
    } finally {
      setBusy(false)
    }
  }
  const pick = async (kind: 'folder' | 'file'): Promise<void> => add(await window.ff.invoke('sources:pick', kind))

  const onDragEnter = (e: DragEvent): void => {
    e.preventDefault()
    depth.current++
    if (!over) {
      setOver(true)
      if (!reduceMotion && iconScope.current) void animateIcon(iconScope.current, { y: [0, -8, 0] }, { duration: 0.42, ease: ease.out })
    }
  }
  const onDragLeave = (e: DragEvent): void => {
    e.preventDefault()
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setOver(false)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.ff.pathForFile(f))
      .filter(Boolean)
    void add(paths)
  }

  const manage = mode === 'manage'
  const pending = progress.running ? Math.max(0, progress.filesTotal - progress.filesDone) : 0

  return (
    <>
      <div className={s.content} onDragEnter={onDragEnter} onDragOver={(e) => e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
        <div>
          <h1 className={w.h1}>{manage ? t('onboarding.manageTitle') : t('onboarding.filesTitle')}</h1>
          <p className={w.lead} style={{ marginTop: 8 }}>
            {manage ? t('onboarding.manageBody') : t('onboarding.filesBody')}
          </p>
        </div>

        <div ref={dropScope} className={s.drop} data-over={over}>
          <svg className={s.dropBorder} aria-hidden>
            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="19" />
          </svg>
          <span ref={iconScope} className={s.dropIcon}>
            <UploadCloud size={30} strokeWidth={1.75} aria-hidden />
          </span>
          <div className={s.dropText}>
            <div className={s.dropTitle}>{over ? t('onboarding.dropActive') : t('onboarding.dropTitle')}</div>
            <div className={s.dropButtons}>
              <button type="button" className={w.primary} onClick={() => void pick('folder')} disabled={busy}>
                <FolderPlus size={20} strokeWidth={1.75} aria-hidden />
                {t('onboarding.addFolder')}
              </button>
              <span className={w.muted}>{t('onboarding.or')}</span>
              <button type="button" className={w.secondary} onClick={() => void pick('file')} disabled={busy}>
                <FilePlus size={20} strokeWidth={1.75} aria-hidden />
                {t('onboarding.addFiles')}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div
              className={s.message}
              role="alert"
              style={{ whiteSpace: 'pre-line' }}
              initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? fade : spring.snappy}
            >
              {message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={s.list}>
          {sources.length === 0 && <div className={s.emptyList}>{t('onboarding.emptyList')}</div>}
          <AnimatePresence initial={false}>
            {sources.map((src) => (
              <motion.div
                key={src.path}
                layout={!reduceMotion}
                className={s.sourceCard}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: -12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: dur.sm } }}
                transition={reduceMotion ? fade : spring.smooth}
              >
                <span className={s.sourceIcon}>{src.kind === 'folder' ? <Folder size={22} strokeWidth={1.75} /> : <FileSpreadsheet size={22} strokeWidth={1.75} />}</span>
                <div className={s.sourceText} title={src.path}>
                  <bdi className={s.sourceName}>{baseName(src.path)}</bdi>
                  <span className={s.sourcePath}>{shortPath(src.path)}</span>
                </div>
                {src.status === 'offline' ? (
                  <span className={s.offline} title={t('onboarding.offlineHint')}>
                    {t('onboarding.offline')}
                  </span>
                ) : (
                  <span className={`${s.sourceCount} num`}>
                    {src.fileCount === 1 ? t('onboarding.fileCountOne') : t('onboarding.fileCount', { count: src.fileCount })}
                  </span>
                )}
                <button type="button" className={s.removeButton} onClick={() => void window.ff.invoke('sources:remove', src.path)} aria-label={`${t('common.remove')} ${baseName(src.path)}`} title={t('common.remove')}>
                  <X size={20} strokeWidth={1.75} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {manage && errors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <h2 className={w.h2} style={{ marginBottom: 10 }}>
                {t('onboarding.problemsTitle')}
              </h2>
              <ErrorList errors={errors} />
            </div>
          )}
        </div>

        {sources.length > 0 && (
          <div className={s.summary} role="status">
            <span className="num">{t('onboarding.foundSummary', { files: totals.files })}</span>
            {totals.skipped > 0 && <span className="num">, {t('onboarding.skippedSummary', { skipped: totals.skipped })}</span>}
            {manage && pending > 0 && <span className="num"> · {t('bar.stillReading', { count: pending })}</span>}
          </div>
        )}
      </div>

      <div className={s.footer}>
        {manage ? (
          <>
            <button type="button" className={w.ghost} onClick={() => void window.ff.invoke('index:reindex', { force: true })} disabled={sources.length === 0}>
              {t('onboarding.reindex')}
            </button>
            <div className={s.footerEnd}>
              <button type="button" className={w.primary} onClick={() => void window.ff.invoke('window:close')}>
                {t('common.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <Dots step="files" />
            <div className={s.footerEnd}>
              <button type="button" className={w.ghost} onClick={onBack}>
                {t('common.back')}
              </button>
              <button type="button" className={w.primary} onClick={onNext} disabled={sources.length === 0}>
                {t('onboarding.startIndexing')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function IndexingStep({ onDone, onStartNow }: { onDone: () => void; onStartNow: () => void }): ReactNode {
  const { t, reduceMotion } = useApp()
  const progress = useProgress()
  const errors = useErrors(progress)
  const [totals, setTotals] = useState({ files: 0, rows: 0 })
  const [finished, setFinished] = useState(false)
  const sawRun = useRef(false)

  // Totals of everything indexed (also covers files read before this step was shown).
  const loadTotals = useCallback(async () => {
    const tree = await window.ff.invoke('scope:tree')
    const files = tree.reduce((a, src) => a + src.files.length, 0)
    const rows = tree.reduce((a, src) => a + src.files.reduce((b, f) => b + f.sheets.reduce((c, sh) => c + sh.rows, 0), 0), 0)
    setTotals({ files, rows })
  }, [])
  useFFEvent('index:changed', useCallback(() => void loadTotals(), [loadTotals]))

  useEffect(() => {
    if (progress.running) sawRun.current = true
    if (!progress.running) {
      void loadTotals()
      // give the worker a moment to pick up a scan that was just requested
      const id = setTimeout(() => setFinished(true), sawRun.current ? 300 : 1200)
      return () => clearTimeout(id)
    }
    setFinished(false)
  }, [progress.running, loadTotals])

  useEffect(() => {
    if (finished && errors.length === 0) {
      const id = setTimeout(onDone, 700)
      return () => clearTimeout(id)
    }
  }, [finished, errors.length, onDone])

  const fraction = progress.running && progress.filesTotal > 0 ? progress.filesDone / progress.filesTotal : finished ? 1 : null
  const rows = progress.running ? Math.max(totals.rows, progress.rowsIndexed) : totals.rows

  return (
    <>
      <div className={s.content}>
        <h1 className={w.h1}>{finished && errors.length > 0 ? t('onboarding.problemsTitle') : t('onboarding.indexingTitle')}</h1>
        {!(finished && errors.length > 0) && <p className={w.lead}>{t('onboarding.indexingBody')}</p>}
        <div className={s.indexing}>
          <div className={s.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}>
            {fraction === null ? (
              <div className={s.shimmer} />
            ) : (
              <motion.div className={s.fill} initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(0.03, fraction) }} transition={reduceMotion ? fade : spring.smooth} />
            )}
          </div>
          <div className={s.currentFile} aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={progress.currentFile ?? '-'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.sm }} style={{ display: 'block' }}>
                {progress.currentFile ? <bdi dir="ltr">{baseName(progress.currentFile)}</bdi> : '\u00a0'}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className={s.stats}>
            {progress.running && (
              <div className={s.stat}>
                <span className={s.statValue}>
                  <Trans k="onboarding.filesProgress" values={{ done: <AnimatedNumber value={progress.filesDone} />, total: <AnimatedNumber value={progress.filesTotal} /> }} />
                </span>
              </div>
            )}
            <div className={s.stat}>
              <span className={s.statLabel}>
                <Trans k="onboarding.rowsProgress" values={{ rows: <span className={s.statValue} style={{ display: 'block' }}><AnimatedNumber value={rows} /></span> }} />
              </span>
            </div>
          </div>
          {finished && <ErrorList errors={errors} />}
        </div>
      </div>
      <div className={s.footer}>
        <Dots step="indexing" />
        <div className={s.footerEnd}>
          {finished && errors.length > 0 ? (
            <button type="button" className={w.primary} onClick={onDone} autoFocus>
              {t('common.next')}
            </button>
          ) : (
            <button type="button" className={w.secondary} onClick={onStartNow}>
              <Search size={20} strokeWidth={1.75} aria-hidden />
              {t('onboarding.startNow')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function DoneStep({ onFinish }: { onFinish: () => void }): ReactNode {
  const { t, reduceMotion } = useApp()
  const [totals, setTotals] = useState({ files: 0, rows: 0 })
  useEffect(() => {
    void window.ff.invoke('scope:tree').then((tree) =>
      setTotals({
        files: tree.reduce((a, src) => a + src.files.length, 0),
        rows: tree.reduce((a, src) => a + src.files.reduce((b, f) => b + f.sheets.reduce((c, sh) => c + sh.rows, 0), 0), 0)
      })
    )
  }, [])
  const tips: { icon: ReactNode; title: MessageKey; body: MessageKey }[] = [
    { icon: <Search size={20} strokeWidth={1.75} />, title: 'onboarding.tip1Title', body: 'onboarding.tip1Body' },
    { icon: <ClipboardCheck size={20} strokeWidth={1.75} />, title: 'onboarding.tip2Title', body: 'onboarding.tip2Body' },
    { icon: <Move size={20} strokeWidth={1.75} />, title: 'onboarding.tip3Title', body: 'onboarding.tip3Body' }
  ]
  return (
    <>
      {!reduceMotion && <Confetti />}
      <div className={s.done}>
        <svg className={s.doneMark} viewBox="0 0 76 76" aria-hidden>
          <motion.circle cx="38" cy="38" r="34" fill="var(--success-soft)" stroke="var(--success)" strokeWidth="3" initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.45, ease: ease.out }} />
          <motion.path d="M24 39l10 10 18-22" fill="none" stroke="var(--success)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.32, delay: 0.3, ease: ease.out }} />
        </svg>
        <h1 className={w.h1}>{t('onboarding.doneTitle')}</h1>
        <p className={w.lead}>
          <Trans k="onboarding.doneBody" values={{ rows: <AnimatedNumber value={totals.rows} />, files: <AnimatedNumber value={totals.files} /> }} />
        </p>
        <div className={s.tips}>
          {tips.map((tip, i) => (
            <motion.div
              key={tip.title}
              className={s.tip}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? fade : { ...spring.gentle, delay: 0.35 + i * 0.08 }}
            >
              <span className={s.tipIcon} aria-hidden>
                {tip.icon}
              </span>
              <span className={s.tipTitle}>{t(tip.title)}</span>
              <span className={s.tipBody}>{t(tip.body)}</span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className={s.footer}>
        <Dots step="done" />
        <div className={s.footerEnd}>
          <button type="button" className={w.primary} onClick={onFinish} autoFocus>
            <Search size={20} strokeWidth={1.75} aria-hidden />
            {t('onboarding.finish')}
          </button>
        </div>
      </div>
    </>
  )
}
