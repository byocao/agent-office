// The stage (the café: src/office/ui/cafe.js) and everything that floats over it.
import { getT } from '@/i18n/server';
import TimelinePanel from './TimelinePanel';
import ReplayBar from './ReplayBar';

export default async function Stage() {
  const t = await getT();
  return (
    <main className="stage-wrap" id="stage-wrap">
      <div id="stage"></div>
      <TimelinePanel />
      <nav className="chips" id="chips" aria-label={t('ui.stage.chips')}></nav>
      <div className="perm-stack" id="perm-stack" hidden aria-live="assertive"></div>
      <div className="incident" id="incident" hidden role="alert"></div>
      <ReplayBar />
      <div className="empty" id="empty" hidden><b>{t('ui.stage.emptyTitle')}</b><span className="muted">{t('ui.stage.emptyText')}</span></div>
    </main>
  );
}
