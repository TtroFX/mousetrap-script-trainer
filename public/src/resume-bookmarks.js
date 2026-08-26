export class ResumeBookmarksUI {
  constructor({ app, store, state, go, chrome, sceneMeta, esc }) {
    this.app = app;
    this.store = store;
    this.state = state;
    this.go = go;
    this.chrome = chrome;
    this.sceneMeta = sceneMeta;
    this.esc = esc;
    this.undoTimer = 0;
  }

  afterRoute(path, q = new URLSearchParams()) {
    if (path === '/home') this.decorateHome();
    else if (path === '/script') this.decorateScript();
    else if (path === '/line') this.decorateLine(q);
    else if (path === '/more') this.decorateMore();
  }

  resumeTitle(entry) {
    if (!entry) return '';
    if (entry.kind === 'cue') return 'Cue Practice';
    if (entry.kind === 'rehearsal') return 'Rehearsal';
    if (entry.kind === 'lineDetail') return 'Line Detail';
    return 'Script';
  }

  resumeMeta(entry) {
    if (!entry) return '';
    const bits = [this.sceneMeta(entry.sceneId).label];
    if (entry.kind === 'script' && entry.readerMode) bits.push(entry.readerMode === 'full' ? 'Full' : entry.readerMode === 'mine' ? 'Mine' : 'Cue Focus');
    if (entry.role) bits.push(entry.role);
    if (entry.total) bits.push(`${Math.min(Number(entry.current) || 1, Number(entry.total) || 1)} / ${Number(entry.total) || 0}`);
    return bits.join(' · ');
  }

  applyResume(entry) {
    if (!entry) return;
    if (entry.sceneId) this.state.setScene(entry.sceneId);
    if (entry.role) this.state.setRole(entry.role);
    if (entry.readerMode) this.state.setReaderMode(entry.readerMode);
    if (entry.kind === 'cue') this.go(`#/cue?scene=${encodeURIComponent(entry.sceneId)}`);
    else if (entry.kind === 'rehearsal') this.go(`#/rehearsal?scene=${encodeURIComponent(entry.sceneId)}`);
    else if (entry.kind === 'lineDetail' && entry.lineId) this.go(`#/line?scene=${encodeURIComponent(entry.sceneId)}&line=${encodeURIComponent(entry.lineId)}`);
    else this.go(`#/script${entry.lineId ? `?line=${encodeURIComponent(entry.lineId)}` : ''}`);
  }

  decorateHome() {
    const shell = this.app.querySelector('.shell');
    const header = shell?.querySelector('.app-top');
    if (!shell || !header) return;
    shell.querySelector('[data-resume-home]')?.remove();
    shell.querySelector('[data-bookmarks-home]')?.remove();
    const latest = this.state.latestResume();
    const practice = this.state.latestPracticeResume();
    if (latest) {
      const section = document.createElement('section');
      section.className = 'card resume-card';
      section.dataset.resumeHome = '1';
      section.innerHTML = `<div class="eyebrow">Continue</div><div class="resume-main"><div><h2>Continue ${this.esc(this.resumeTitle(latest))}</h2><p>${this.esc(this.resumeMeta(latest))}</p></div><button class="primary-btn" type="button" data-resume-primary>Continue</button></div>${practice && practice.kind !== latest.kind ? `<button class="resume-practice-link" type="button" data-resume-practice>Resume Practice · ${this.esc(this.resumeTitle(practice))}</button>` : ''}`;
      header.insertAdjacentElement('afterend', section);
      section.querySelector('[data-resume-primary]').onclick = () => this.applyResume(latest);
      section.querySelector('[data-resume-practice]')?.addEventListener('click', () => this.applyResume(practice));
    }
    const count = Object.keys(this.state.bookmarks()).length;
    const bookmarkCard = document.createElement('section');
    bookmarkCard.className = 'card bookmark-home-card';
    bookmarkCard.dataset.bookmarksHome = '1';
    bookmarkCard.innerHTML = `<div><div class="eyebrow">Bookmarks</div><h3>${count} ${count === 1 ? 'line' : 'lines'} saved</h3><p class="muted">Save lines you want to revisit or memorize.</p></div><button class="ghost-btn" type="button" data-open-bookmarks>View Bookmarks</button>`;
    const sceneGrid = shell.querySelector('.scene-grid');
    (sceneGrid || shell.lastElementChild).insertAdjacentElement('afterend', bookmarkCard);
    bookmarkCard.querySelector('[data-open-bookmarks]').onclick = () => this.go('#/bookmarks');
  }

  bookmarkToggle(sceneId, lineId, className = '') {
    const active = this.state.isBookmarked(lineId);
    const el = document.createElement('span');
    el.className = `bookmark-toggle ${active ? 'active' : ''} ${className}`.trim();
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', active ? 'Remove bookmark' : 'Add bookmark');
    el.dataset.bookmarkToggle = lineId;
    el.textContent = active ? '★' : '☆';
    const toggle = event => {
      event.preventDefault();
      event.stopPropagation();
      const result = this.state.toggleBookmark(sceneId, lineId);
      const now = !!result?.bookmarked;
      el.classList.toggle('active', now);
      el.textContent = now ? '★' : '☆';
      el.setAttribute('aria-label', now ? 'Remove bookmark' : 'Add bookmark');
      this.showToast(now ? 'Bookmark added' : 'Bookmark removed', result?.removed || null);
    };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') toggle(event); });
    return el;
  }

  decorateScript() {
    const sceneId = this.state.selectedScene();
    this.app.querySelectorAll('[data-line]').forEach(row => {
      const lineId = row.dataset.line;
      if (!lineId || row.querySelector('[data-bookmark-toggle]')) return;
      row.classList.add('bookmarkable-line');
      row.append(this.bookmarkToggle(sceneId, lineId, 'line-bookmark-toggle'));
    });
  }

  decorateLine(q) {
    const sceneId = q.get('scene');
    const lineId = q.get('line');
    if (!sceneId || !lineId || !this.store.getSpeech(sceneId, lineId)) return;
    const card = this.app.querySelector('.line-page .card');
    if (!card || card.querySelector('[data-bookmark-toggle]')) return;
    const holder = document.createElement('div');
    holder.className = 'line-bookmark-holder';
    const label = document.createElement('span');
    label.textContent = 'Bookmark';
    holder.append(label, this.bookmarkToggle(sceneId, lineId, 'line-detail-bookmark'));
    card.prepend(holder);
  }

  decorateMore() {
    const tools = this.app.querySelector('.shell .card:last-of-type .toolbar');
    if (!tools || tools.querySelector('[data-more-bookmarks]')) return;
    const button = document.createElement('button');
    button.className = 'ghost-btn';
    button.type = 'button';
    button.dataset.moreBookmarks = '1';
    button.textContent = `Bookmarks (${Object.keys(this.state.bookmarks()).length})`;
    button.onclick = () => this.go('#/bookmarks');
    tools.append(button);
  }

  canonicalBookmarks(filter = 'all') {
    const all = this.state.bookmarks();
    const rows = [];
    for (const scene of this.store.hasCore() ? ['act1-scene1', 'act1-scene2', 'act2'] : []) {
      if (filter !== 'all' && filter !== scene) continue;
      for (const speech of this.store.getScene(scene)) {
        const saved = all[speech.id];
        if (saved) rows.push({ ...saved, speech });
      }
    }
    return rows;
  }

  renderBookmarks(q = new URLSearchParams()) {
    const filter = ['act1-scene1', 'act1-scene2', 'act2'].includes(q.get('scene')) ? q.get('scene') : 'all';
    if (!this.store.hasCore()) {
      this.chrome('<section class="card"><div class="eyebrow">Bookmarks</div><h2>Bookmarks</h2><p class="muted">Loading script data…</p></section>', 'more');
      return;
    }
    const rows = this.canonicalBookmarks(filter);
    const filters = [{ id: 'all', label: 'All' }, ...['act1-scene1', 'act1-scene2', 'act2'].map(id => ({ id, label: this.sceneMeta(id).label }))];
    this.chrome(`<section class="card bookmark-list-head"><div class="eyebrow">Bookmarks</div><h2>Bookmarks</h2><p class="muted">Tap a line to open Line Detail. Tap ★ to remove it instantly.</p><div class="bookmark-filters">${filters.map(x => `<button type="button" class="ghost-btn ${filter === x.id ? 'selected-tool' : ''}" data-bookmark-filter="${x.id}">${this.esc(x.label)}</button>`).join('')}</div></section><section class="bookmark-list" data-bookmark-list>${rows.length ? rows.map(x => `<div class="bookmark-row" data-bookmark-row="${this.esc(x.lineId)}"><button type="button" class="bookmark-open" data-bookmark-open="${this.esc(x.lineId)}" data-bookmark-scene="${this.esc(x.sceneId)}"><span><b>${this.esc(x.speech.speaker)}</b> · ${this.esc(this.sceneMeta(x.sceneId).label)}</span><span>${this.esc(x.speech.text)}</span></button><button type="button" class="bookmark-remove" aria-label="Remove bookmark" data-bookmark-remove="${this.esc(x.lineId)}">★</button></div>`).join('') : '<div class="card bookmark-empty"><h3>No bookmarks yet</h3><p class="muted">Tap ☆ in Script or Line Detail to save a line here.</p><button class="primary-btn" type="button" data-bookmark-go-script>Open Script</button></div>'}</section>`, 'more');
    this.app.querySelectorAll('[data-bookmark-filter]').forEach(button => button.onclick = () => this.go(button.dataset.bookmarkFilter === 'all' ? '#/bookmarks' : `#/bookmarks?scene=${encodeURIComponent(button.dataset.bookmarkFilter)}`));
    this.app.querySelectorAll('[data-bookmark-open]').forEach(button => button.onclick = () => { this.state.setScene(button.dataset.bookmarkScene); this.go(`#/line?scene=${encodeURIComponent(button.dataset.bookmarkScene)}&line=${encodeURIComponent(button.dataset.bookmarkOpen)}`); });
    this.app.querySelectorAll('[data-bookmark-remove]').forEach(button => button.onclick = () => {
      const removed = this.state.removeBookmark(button.dataset.bookmarkRemove);
      button.closest('[data-bookmark-row]')?.remove();
      if (!this.app.querySelector('[data-bookmark-row]')) this.renderBookmarks(new URLSearchParams(location.hash.split('?')[1] || ''));
      this.showToast('Bookmark removed', removed || null);
    });
    this.app.querySelector('[data-bookmark-go-script]')?.addEventListener('click', () => this.go('#/script'));
  }

  showToast(message, undoEntry = null) {
    const host = document.getElementById('toast');
    if (!host) return;
    clearTimeout(this.undoTimer);
    host.replaceChildren();
    const text = document.createElement('span');
    text.textContent = message;
    host.append(text);
    host.classList.toggle('actionable', !!undoEntry);
    if (undoEntry) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.textContent = 'Undo';
      undo.onclick = () => {
        this.state.restoreBookmark(undoEntry);
        host.classList.remove('show', 'actionable');
        if (location.hash.startsWith('#/bookmarks')) this.renderBookmarks(new URLSearchParams(location.hash.split('?')[1] || ''));
        else this.afterRoute(location.hash.replace(/^#/, '').split('?')[0] || '/home', new URLSearchParams(location.hash.split('?')[1] || ''));
      };
      host.append(undo);
    }
    host.classList.add('show');
    this.undoTimer = setTimeout(() => host.classList.remove('show', 'actionable'), 3500);
  }
}
