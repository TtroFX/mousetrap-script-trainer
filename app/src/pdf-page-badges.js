// PDF page badges for Script reader tiles and Line Detail.
// Source authority: "The Mousetrap 台本.pdf"
// SHA-256: 94d46d2afe7504d2010c10b3ef4f1017bc3adfe0c09ab86bfd837167357c397b
// A speech is labeled with the physical PDF page on which its speaker label begins.
const PDF_PAGE_BOUNDARIES = Object.freeze({
  'act1-scene1': [[1,3],[3,4],[15,5],[33,6],[43,7],[51,8],[61,9],[72,10],[85,11],[99,12],[114,13],[123,14],[133,15],[150,16],[158,17],[174,18],[187,19]],
  'act1-scene2': [[1,20],[14,21],[30,22],[48,23],[66,24],[79,25],[95,26],[109,27],[125,28],[138,29],[150,30],[168,31],[183,32],[194,33],[208,34],[222,35],[233,36],[245,37],[260,38],[275,39],[295,40],[310,41],[327,42],[336,43]],
  'act2': [[1,44],[13,45],[25,46],[42,47],[60,48],[79,49],[93,50],[102,51],[115,52],[133,53],[148,54],[166,55],[180,56],[202,57],[219,58],[239,59],[250,60],[272,61],[287,62],[309,63],[327,64],[346,65],[368,66],[373,67],[379,68],[394,69],[416,70],[433,71],[457,72],[479,73],[499,74],[510,75],[520,76],[539,77],[556,78],[566,79],[574,80],[588,81],[599,82],[614,83],[628,84]],
});

function pageForLine(lineId) {
  const match = /^(act1-scene1|act1-scene2|act2)-speech-(\d{4})$/.exec(String(lineId || ''));
  if (!match) return null;

  const ordinal = Number(match[2]);
  const ranges = PDF_PAGE_BOUNDARIES[match[1]];
  let page = null;

  for (const [start, candidate] of ranges) {
    if (ordinal < start) break;
    page = candidate;
  }

  return page;
}

function ensureStyle() {
  if (document.querySelector('style[data-pdf-page-badge-style]')) return;

  const style = document.createElement('style');
  style.dataset.pdfPageBadgeStyle = '1';
  style.textContent = [
    '.line-row{position:relative}',
    '.pdf-page-badge{position:absolute;top:6px;right:10px;z-index:1;pointer-events:none;',
    'font:800 9px/1 system-ui,-apple-system,"Noto Sans JP",sans-serif;letter-spacing:.02em;',
    'color:var(--muted);opacity:.78}',
    '.line-page .speaker-title{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.pdf-page-badge.pdf-page-badge--detail{position:static;z-index:auto;flex:0 0 auto;',
    'font-size:10px;letter-spacing:0;text-transform:none;color:var(--muted);opacity:.82}'
  ].join('');
  document.head.append(style);
}

function createBadge(page, detail = false) {
  const badge = document.createElement('span');
  badge.className = `pdf-page-badge${detail ? ' pdf-page-badge--detail' : ''}`;
  badge.dataset.pdfPage = String(page);
  badge.textContent = `p.${page}`;
  badge.title = `PDF page ${page}`;
  badge.setAttribute('aria-label', `PDF page ${page}`);
  return badge;
}

function decorateList(root) {
  root.querySelectorAll('.line-row[data-line]').forEach(row => {
    if (row.querySelector('[data-pdf-page]')) return;

    const page = pageForLine(row.dataset.line);
    if (!page) return;

    row.append(createBadge(page));
  });
}

function currentDetailLineId() {
  if (!location.hash.startsWith('#/line')) return '';
  const query = location.hash.split('?')[1] || '';
  return new URLSearchParams(query).get('line') || '';
}

function decorateDetail(root) {
  const title = root.querySelector('.line-page .card:first-child .speaker-title');
  if (!title || title.querySelector('[data-pdf-page]')) return;

  const page = pageForLine(currentDetailLineId());
  if (!page) return;

  title.append(createBadge(page, true));
}

function decorate(root) {
  decorateList(root);
  decorateDetail(root);
}

function start() {
  const app = document.getElementById('app');
  if (!app) return;

  ensureStyle();

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorate(app);
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  schedule();
}

start();

export { PDF_PAGE_BOUNDARIES, pageForLine };
