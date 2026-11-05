import React from 'react';
import {useSession} from '../App';
import {can} from '../rbac';
import {Card, Stat, Notice, useLoad, fmt, pct} from '../ui';
import {errorMessage} from '../firebase';
import {userMetrics, retentionMetrics, versionMetrics, contentMetrics, moderationMetrics, securityMetrics} from '../lib/metrics';

function Section<T>({title, subtitle, load, render}: {title: string; subtitle: string; load: () => Promise<T>; render: (d: T) => React.ReactNode}) {
  const {data, error, loading, reload} = useLoad(load, []);
  return <Card title={title} subtitle={subtitle} actions={<button className="btn ghost" onClick={reload} disabled={loading}>Refresh</button>}>
    {loading ? <p className="muted">Loading live data…</p> : error ? <Notice kind="error">{errorMessage(error)}</Notice> : data ? render(data) : null}
  </Card>;
}

export default function Dashboard() {
  const {role} = useSession();
  const [bundled, setBundled] = React.useState<number | null>(null);
  React.useEffect(() => {fetch('/admin/library-index.json').then(r => r.json()).then((l: unknown[]) => setBundled(l.length)).catch(() => setBundled(null));}, []);
  return <div className="stack">
    <header className="page-head"><h1>Dashboard</h1><p className="muted">Live figures queried from Firestore when you open or refresh a card. No figure on this page is estimated or simulated.</p></header>
    {can(role, 'users.read') && <Section title="Users" subtitle="Accounts with a cloud profile (signed-in users). Guests who never sign in are not counted — the app has no analytics SDK." load={() => userMetrics()} render={d => <>
      <div className="stats">
        <Stat label="Registered users" value={fmt(d.total)} hint="active + suspended" />
        <Stat label="Daily active" value={fmt(d.dau)} hint="synced in last 24 h" />
        <Stat label="Weekly active" value={fmt(d.wau)} hint="last 7 days" />
        <Stat label="Monthly active" value={fmt(d.mau)} hint="last 30 days" />
        <Stat label="New (7 days)" value={fmt(d.new7)} />
        <Stat label="New (30 days)" value={fmt(d.new30)} />
        <Stat label="Suspended" value={fmt(d.suspended)} />
      </div>
      <h3>Learning activity</h3>
      <div className="stats">
        <Stat label="Quiz rounds completed" value={fmt(d.quizzes)} hint="sum of users’ saved round history (last 200 each)" />
        <Stat label="Saved words" value={fmt(d.saved)} hint="sum across users" />
        <Stat label="Words in review" value={fmt(d.reviewed)} />
        <Stat label="Avg. levels played" value={fmt(d.avgLevels, 2)} hint="of 4" />
        <Stat label="Avg. current streak" value={fmt(d.avgStreak, 2)} hint="days" />
      </div>
      <p className="small muted">Activity figures come from each account’s last sync. Active = last sync time, so users who learn offline appear when they next connect.</p>
    </>} />}
    {can(role, 'users.read') && <Section title="Retention" subtitle="“Still active after N days”: of users who signed up in the last 90 days and are old enough, the share whose last activity is at least N days after sign-up." load={() => retentionMetrics()} render={d => <>
      <div className="stats">{d.rows.map(r => <Stat key={r.day} label={`Day ${r.day}`} value={pct(r.rate)} hint={`${fmt(r.retained)} of ${fmt(r.eligible)} eligible`} />)}</div>
      <p className="small muted">Computed from {fmt(d.sample)} sign-ups (maximum 2,000 most recent). For full cohort analysis export Firestore to BigQuery.</p>
    </>} />}
    {can(role, 'users.read') && <Section title="App versions" subtitle="Reported by the 500 most recently active accounts." load={() => versionMetrics()} render={d => d.rows.length ? <table><thead><tr><th>Version</th><th>Accounts</th><th>Share</th></tr></thead><tbody>{d.rows.map(r => <tr key={r.version}><td>{r.version}</td><td>{fmt(r.count)}</td><td>{pct(r.count / d.sample)}</td></tr>)}</tbody></table> : <p className="muted">No active accounts yet.</p>} />}
    {can(role, 'content.read') && <Section title="Slang database" subtitle="Bundled entries ship inside the app; CMS entries are working copies managed here." load={() => contentMetrics()} render={d => <div className="stats">
      <Stat label="Bundled in app" value={fmt(bundled)} hint="read-only baseline" />
      <Stat label="Live CMS entries" value={fmt(d.live)} hint="delivered without an app update" />
      <Stat label="Drafts" value={fmt(d.draft)} />
      <Stat label="In review" value={fmt(d.review)} />
      <Stat label="Archived" value={fmt(d.archived)} />
    </div>} />}
    {(can(role, 'reports.moderate') || can(role, 'feedback.read')) && <Section title="Reports & feedback" subtitle="Submitted by signed-in users from the app." load={() => moderationMetrics()} render={d => <div className="stats">
      {can(role, 'submissions.review') && <Stat label="Pending suggestions" value={fmt(d.pending)} />}
      {can(role, 'reports.moderate') && <Stat label="Open content reports" value={fmt(d.openReports)} />}
      {can(role, 'feedback.read') && <><Stat label="Feedback (new)" value={fmt(d.feedbackNew)} /><Stat label="Feedback (total)" value={fmt(d.feedbackTotal)} /><Stat label="Avg. rating" value={d.avgRating === null ? '—' : `${d.avgRating.toFixed(2)} / 5`} /></>}
    </div>} />}
    {can(role, 'security.read') && <Section title="Security events (7 days)" subtitle="Events reported by signed-in clients and the portal. Server-side rule denials are not logged by Firestore itself." load={() => securityMetrics()} render={d => d.total ? <table><thead><tr><th>Type</th><th>Count</th></tr></thead><tbody>{d.byType.map(([t, n]) => <tr key={t}><td>{t}</td><td>{fmt(n)}</td></tr>)}</tbody></table> : <p className="muted">No security events in the last 7 days.{d.capped ? ' (capped at 1,000)' : ''}</p>} />}
  </div>;
}
