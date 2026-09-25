/**
 * The "Host check" page.
 *
 * Two answers side by side, because a plugin that styles someone else's interface
 * fails in two different ways:
 *
 *   this build, live     the probe in ../../judge.ts runs against the DOM, the
 *                        host stylesheets and the Cordis services — what the
 *                        plugin can actually see right now.
 *   the installed files  the node half's scan (src/host-scan.ts) reports whether
 *                        the packages on disk still contain every literal the
 *                        plugin depends on, and names the host's own version.
 *
 * The page exists so a failure stops being "背景不动了": it names the hop, the
 * literal, the file that should define it and the file of this plugin that reads
 * it — and copies all of that as one markdown block for an issue.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { ThemeSectionProps } from '../../types'
import type { ContractResult, HostReport } from '../../../host-contracts'
import { CONTRACT_GROUPS, HOST_CONTRACTS, verdictOf, reportToMarkdown } from '../../../host-contracts'
import { buildClientReport } from '../../judge'
import { readHostScan } from '../../rpc'
import { PLUGIN_VERSION, DSH_FLOOR } from '../../build-info'
import { CheckIcon, AlertIcon, RefreshIcon, CopyIcon, LayersIcon } from '../icons'

/** Contract id → its group, so the panel's order is the table's order. */
const GROUP_OF = new Map(HOST_CONTRACTS.map(c => [c.id, c.group]))

export function HostPage({ p, notify }: { p: ThemeSectionProps; notify: (msg: string, ok?: boolean) => void }) {
  const { t, lang, readModelFacts } = p
  const [client, setClient] = useState<HostReport | null>(null)
  const [scanned, setScanned] = useState<HostReport | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      // The live probe first: it is synchronous and always answers. The version
      // and the on-disk verdict are node-side facts, so they arrive afterwards.
      setClient(buildClientReport({
        ctx: p.ctx,
        lang,
        pluginVersion: PLUGIN_VERSION,
        floor: DSH_FLOOR,
        model: readModelFacts?.(),
      }, { version: '', compatible: null, note: '' }))
      setScanned(await readHostScan(lang))
    } finally {
      setBusy(false)
    }
  }, [p, lang, readModelFacts])

  useEffect(() => { void run() }, [run])

  const hostVersion = scanned?.host.version ?? ''
  const compatible = scanned?.host.compatible ?? null
  const verdict = client === null ? 'unknown' : verdictOf(client)
  const diskVerdict = scanned === null ? 'unknown' : verdictOf(scanned)
  const rows = client?.results ?? []

  const copyReport = async () => {
    const parts: string[] = []
    if (client !== null) parts.push(reportToMarkdown(client, lang))
    if (scanned !== null) parts.push(reportToMarkdown(scanned, lang))
    try {
      await navigator.clipboard.writeText(parts.join('\n\n'))
      notify(t('hostCopied'))
    } catch {
      // Clipboard denied (an insecure origin, or a policy): say so instead of
      // pretending the report was copied.
      notify(t('hostCopyFail'), false)
    }
  }

  const statusWord = (s: ContractResult['status']): string => (
    s === 'pass' ? t('hostPass') : s === 'fail' ? t('hostFail') : s === 'skip' ? t('hostNa') : t('hostInfo')
  )

  const row = (r: ContractResult): ReactElement => (
    <li key={r.id} className={`dab-check dab-check-${r.status}`}>
      <span className={`dab-check-ico dab-check-ico-${r.status}`} aria-hidden="true">
        {r.status === 'pass' ? <CheckIcon size={12} />
          : r.status === 'fail' ? <AlertIcon size={12} />
            : <span className="dab-check-dot" />}
      </span>
      <div className="dab-check-body">
        <div className="dab-check-head">
          <span className="dab-check-label">{r.label}</span>
          <span className={`dab-check-status dab-check-status-${r.status}`}>{statusWord(r.status)}</span>
          <code className="dab-check-target">{r.target}</code>
        </div>
        {r.status === 'fail' ? (
          <div className="dab-check-reason">
            <div>{r.reason ?? r.detail}</div>
            <div className="dab-check-symptom">{r.symptom}</div>
            <div className="dab-check-where">
              <span>{t('hostExpectedIn')}</span>
              <code>{r.sources.map(s => s.path).join('  ·  ')}</code>
            </div>
            <div className="dab-check-where">
              <span>{t('hostUsedBy')}</span>
              <code>{r.usedBy}</code>
            </div>
          </div>
        ) : (
          <div className="dab-check-detail" title={r.checks.join('\n')}>{r.detail}</div>
        )}
      </div>
    </li>
  )

  let rise = 1

  return (
    <>
      <header className="dab-head dab-rise" style={{ '--d': 0 } as CSSProperties}>
        <div className="dab-overline">Host check</div>
        <h2 className="dab-h1">{t('pageHostCheck')}</h2>
        <p className="dab-desc">{t('descHostCheck')}</p>
      </header>

      <section className={`dab-card dab-verdict dab-verdict-${verdict} dab-rise`} style={{ '--d': rise++ } as CSSProperties}>
        <div className="dab-verdict-head">
          <span className={`dab-verdict-ico dab-verdict-ico-${verdict}`} aria-hidden="true">
            {verdict === 'ok' ? <CheckIcon size={16} />
              : verdict === 'unknown' ? <LayersIcon size={16} />
                : <AlertIcon size={16} />}
          </span>
          <div className="dab-verdict-text">
            <div className="dab-verdict-title">
              {verdict === 'ok' ? t('hostAllOk')
                : verdict === 'unknown' ? t('hostUnknown')
                  : verdict === 'broken' ? t('hostBroken')
                    : t('hostPartial')}
            </div>
            <div className="dab-verdict-sub">
              {t('hostSummary')
                .replace('{pass}', String(client?.summary.pass ?? 0))
                .replace('{fail}', String(client?.summary.fail ?? 0))
                .replace('{skip}', String(client?.summary.skip ?? 0))}
            </div>
          </div>
          <div className="dab-verdict-actions">
            <button type="button" className="dab-btn" disabled={busy} onClick={() => void run()}>
              <RefreshIcon size={13} />{busy ? t('hostRunning') : t('hostRerun')}
            </button>
            <button type="button" className="dab-btn dab-btn-primary" onClick={() => void copyReport()}>
              <CopyIcon size={13} />{t('hostCopy')}
            </button>
          </div>
        </div>

        <div className="dab-facts">
          <Fact label="dsh" value={hostVersion !== '' ? hostVersion : t('hostUnreadable')} bad={compatible === false} />
          <Fact label={t('hostPluginFloor')} value={`>=${DSH_FLOOR}`} />
          <Fact label={t('hostPlugin')} value={PLUGIN_VERSION} />
          {scanned !== null && scanned.host.node !== '' ? <Fact label="node" value={scanned.host.node} /> : null}
          <Fact
            label={t('hostDiskScan')}
            value={diskVerdict === 'ok' ? `${scanned?.summary.pass ?? 0}/${scanned?.summary.total ?? 0}`
              : diskVerdict === 'unknown' ? t('hostNa')
                : `${scanned?.summary.fail ?? 0} ${t('hostFail')}`}
            bad={diskVerdict === 'broken' || diskVerdict === 'partial'}
          />
          {client?.host.model !== undefined ? (
            <Fact label={t('hostModel')} value={client.host.model.text !== '' ? client.host.model.text : t('hostModelNone')} />
          ) : null}
        </div>

        {compatible === false ? <p className="dab-check-note">{t('hostBelowFloor')}</p> : null}
        {scanned !== null && scanned.host.note !== '' ? <p className="dab-check-note">{scanned.host.note}</p> : null}
        {diskFailures(scanned) > 0 ? (
          <p className="dab-check-note">
            {t('hostDiskFailures').replace('{n}', String(diskFailures(scanned)))}
          </p>
        ) : null}
      </section>

      {client === null ? (
        <section className="dab-card dab-rise" style={{ '--d': rise } as CSSProperties}>
          <div className="dab-check-detail">{t('hostRunning')}</div>
        </section>
      ) : null}

      {CONTRACT_GROUPS.map(group => {
        const groupRows = rows.filter(r => GROUP_OF.get(r.id) === group.id)
        if (groupRows.length === 0) return null
        const ok = groupRows.filter(r => r.status === 'pass').length
        return (
          <section key={group.id} className="dab-card dab-rise" style={{ '--d': rise++ } as CSSProperties}>
            <div className="dab-check-group-title">
              {lang === 'zh' ? group.label.zh : group.label.en}
              <span className="dab-check-group-count">{ok}/{groupRows.length}</span>
            </div>
            <ul className="dab-checks">{groupRows.map(row)}</ul>
          </section>
        )
      })}

      <p className="dab-hint dab-rise" style={{ '--d': rise++ } as CSSProperties}>{t('hostHint')}</p>

      <footer className="dab-footer dab-rise" style={{ '--d': rise } as CSSProperties}>
        <span className="dab-footer-mono">dsh-background-by-model</span>
        <span>{t('footerTag')}</span>
      </footer>
    </>
  )
}

/** How many contracts the on-disk scan could not find (0 when it did not answer). */
function diskFailures(report: HostReport | null): number {
  return report === null ? 0 : report.summary.fail
}

function Fact({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={`dab-fact${bad ? ' is-bad' : ''}`}>
      <span className="dab-fact-k">{label}</span>
      <code className="dab-fact-v" title={value}>{value}</code>
    </div>
  )
}
