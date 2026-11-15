/* ══════════════════════════════════════════════════════════════════════════
   PUSH FEED — shared data core for the skin prototypes
   (prototypes/nougat.html and prototypes/marshmallow.html)

   The same download → parse → remove repeats → refresh loop as index.html,
   lifted out so each prototype only has to draw. Kept in step with the
   live page by hand; if index.html's CONFIG changes, change it here too.

   Usage:
     PushFeed.start({
       onData(items)          every successful download (newest first)
       onStatus(state, text)  'is-ok' | 'is-warn' | 'is-bad' | '' and a label
       onTick()               every 30 s, to refresh relative times
     });
   Each item: { id, app, pkg, byline, headline, time, side, repeats[], isNew }
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  const CONFIG = {
    CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSeR3fuA85VYkk9nKiFzluKcxM86cBwqAgl85NQZkL3pX6NxhC_lZ1ODq8MKp7giwG4HvcKiLrIr36i/pub?gid=1296297111&single=true&output=csv',
    REFRESH_SECONDS: 60,
    FETCH_TIMEOUT_SECONDS: 15,
    HOLD_MISSING_MINUTES: 10,
    QUIET_AFTER_MINUTES: 180,
    TIME_ZONE: 'Pacific/Auckland',
    IGNORE_APPS: ['heartbeat', 'test'],
    SIDE_TAB: { label: 'AT Mobile', apps: ['at mobile'] },
    DEDUPE_WINDOW_MINUTES: 30,
  };

  // ── CSV parsing (handles quoted commas, doubled quotes, line breaks) ──
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = [];
    let row = [], cell = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
        } else cell += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ── Rows → alerts. Text is the headline; Title becomes a byline only
  //    when it adds something (an author, an AT Mobile alert title). ──
  function rowsToItems(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim().toLowerCase());
    const col = {
      timestamp: header.indexOf('timestamp'), app: header.indexOf('app'),
      pkg: header.indexOf('package'), title: header.indexOf('title'),
      text: header.indexOf('text'), postedAt: header.indexOf('posted at'),
    };
    if (col.text === -1 && col.title === -1) throw new Error('The CSV has no Title or Text column.');
    const get = (row, i) => (i >= 0 && i < row.length ? row[i].trim() : '');
    const out = [];
    for (const row of rows.slice(1)) {
      const app = get(row, col.app), pkg = get(row, col.pkg);
      const title = get(row, col.title), text = get(row, col.text);
      if (!title && !text) continue;
      if (CONFIG.IGNORE_APPS.includes(app.toLowerCase())) continue;
      let time = Number(get(row, col.postedAt));
      if (!Number.isFinite(time) || time <= 0) time = parseSheetTimestamp(get(row, col.timestamp));
      if (!time) continue;
      const headline = text || title;
      const showTitle = title && text && title.toLowerCase() !== app.toLowerCase() && title !== text;
      out.push({
        id: pkg + '|' + time + '|' + headline.slice(0, 40),
        app: app || pkg || 'Unknown app', pkg,
        byline: showTitle ? title : '', headline, time,
        side: !!CONFIG.SIDE_TAB && CONFIG.SIDE_TAB.apps.includes(app.toLowerCase()),
        repeats: [],
      });
    }
    return out;
  }

  function parseSheetTimestamp(s) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    const [, d, mo, y, h, mi, sec] = m.map(Number);
    return new Date(y, mo - 1, d, h, mi, sec || 0).getTime();
  }

  // ── Same app + same headline within 30 min = one alert (first copy). ──
  function normalise(s) {
    return s.normalize('NFKC').toLowerCase()
      .replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"')
      .replace(/\s+/g, ' ').trim().replace(/^['"]+/, '');
  }
  function dedupe(list) {
    const windowMs = CONFIG.DEDUPE_WINDOW_MINUTES * 60000;
    const lastKept = new Map(), kept = [];
    for (const item of [...list].sort((a, b) => a.time - b.time)) {
      const key = (item.pkg || item.app).toLowerCase() + '|' + normalise(item.headline);
      const prev = lastKept.get(key);
      if (prev && item.time - prev.time <= windowMs) { prev.repeats.push(item.time); continue; }
      lastKept.set(key, item);
      kept.push(item);
    }
    return kept;
  }

  // ── Download with a cache buster and a timeout. ──
  async function fetchFeed() {
    const sep = CONFIG.CSV_URL.includes('?') ? '&' : '?';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_SECONDS * 1000);
    try {
      const res = await fetch(CONFIG.CSV_URL + sep + 'cb=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error('Google replied with error ' + res.status);
      const text = await res.text();
      if (/^\s*</.test(text)) throw new Error('Got a web page instead of a CSV.');
      return rowsToItems(parseCSV(text));
    } finally { clearTimeout(timer); }
  }

  // ── Never step backwards: keep alerts a stale copy of the CSV is
  //    missing, for up to HOLD_MISSING_MINUTES. ──
  const heldRows = new Map();
  function combineWithHeld(downloaded) {
    const now = Date.now();
    for (const item of downloaded) heldRows.set(item.id, { item, seenAt: now });
    const oldest = downloaded.length ? Math.min(...downloaded.map(i => i.time)) : Infinity;
    const combined = [...downloaded];
    for (const [id, held] of heldRows) {
      if (held.seenAt === now) continue;
      if (now - held.seenAt > CONFIG.HOLD_MISSING_MINUTES * 60000 || held.item.time < oldest) {
        heldRows.delete(id); continue;
      }
      combined.push(held.item);
    }
    return dedupe(combined.map(item => ({ ...item, repeats: [] }))).sort((a, b) => b.time - a.time);
  }

  // ── Time helpers (NZ time for every visitor). ──
  const tz = CONFIG.TIME_ZONE ? { timeZone: CONFIG.TIME_ZONE } : {};
  const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fullFormat = new Intl.DateTimeFormat('en-NZ', {
    ...tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, timeZoneName: 'short',
  });
  const time = {
    dayKey: ms => dayKeyFormat.format(ms),
    dayLabel(ms) {
      const key = time.dayKey(ms);
      if (key === time.dayKey(Date.now())) return 'Today';
      if (key === time.dayKey(Date.now() - 86400000)) return 'Yesterday';
      return new Date(ms).toLocaleDateString('en-NZ', { ...tz, weekday: 'short', day: 'numeric', month: 'short' });
    },
    // "9:41 am" / "9:41 AM" (upper: true)
    clock(ms, upper) {
      const s = new Date(ms).toLocaleTimeString('en-NZ', { ...tz, hour: 'numeric', minute: '2-digit' });
      return upper ? s.toUpperCase() : s;
    },
    ago(ms) {
      const s = Math.max(0, (Date.now() - ms) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    },
    // Exact moment, for hover: "NZ Herald · Mon 19 Oct 2026, 8:32:13.482 am NZDT"
    full(item) {
      let s = item.app + '\n' + fullFormat.format(item.time);
      if (item.repeats.length) s += `\nRepeated ${item.repeats.length}× (last at ${time.clock(item.repeats[item.repeats.length - 1])}), hidden`;
      return s;
    },
  };

  // ── The loop: download → hand over → wait 60 s; paused while hidden. ──
  function start(hooks) {
    let items = [], seen = new Set(), first = true, ok = null, timer = null, startedAt = 0;

    function status() {
      const newest = items.length ? items[0].time : null;
      if (ok === false) return hooks.onStatus('is-bad', items.length ? 'Can’t reach the feed · showing older alerts' : 'Can’t reach the feed');
      if (!newest) return hooks.onStatus('', ok === null ? 'Loading…' : 'Waiting for the first alert');
      if (Date.now() - newest > CONFIG.QUIET_AFTER_MINUTES * 60000) return hooks.onStatus('is-warn', 'Quiet for ' + time.ago(newest).replace(' ago', ''));
      hooks.onStatus('is-ok', 'Last alert ' + time.ago(newest));
    }

    async function refresh() {
      clearTimeout(timer);
      startedAt = Date.now();
      try {
        const fresh = combineWithHeld(await fetchFeed());
        for (const item of fresh) item.isNew = !first && !seen.has(item.id);
        seen = new Set(fresh.map(i => i.id));
        first = false; ok = true; items = fresh;
        hooks.onData(items);
      } catch (err) {
        console.warn('Push Feed: refresh failed —', err.message);
        ok = false;
        if (first) hooks.onData([]);
      }
      status();
      next();
    }
    function next() {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(refresh, CONFIG.REFRESH_SECONDS * 1000);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
      else if (Date.now() - startedAt > CONFIG.REFRESH_SECONDS * 1000) refresh();
      else next();
    });
    setInterval(() => { status(); hooks.onTick && hooks.onTick(); }, 30000);
    status();
    refresh();
    return { failed: () => ok === false };
  }

  // ── Publisher look: notification colour and glyph file, by app name. ──
  const PUBLISHERS = {
    'nz herald':        { colour: '#1a1a1a', glyph: 'nz-herald',   icon: 'nz-herald' },
    'rnz':              { colour: '#c62828', glyph: 'rnz',         icon: 'rnz' },
    'stuff':            { colour: '#5e35b1', glyph: 'stuff',       icon: 'stuff' },
    'the spinoff':      { colour: '#0048c8', glyph: 'the-spinoff', icon: 'the-spinoff', circleGlyph: 'the-spinoff-s' },
    '1news':            { colour: '#c8412f', glyph: '1news',       icon: '1news', colourGlyph: true, circleGlyph: '1news-mono' },
    'tvnz+':            { colour: '#0072ff', glyph: 'tvnz-plus',   icon: 'tvnz-plus', colourGlyph: true },
    'the post':         { colour: '#1565c0', icon: 'the-post' },
    'te ao māori news': { colour: '#a4032f', icon: 'te-ao-news' },
    'te ao news':       { colour: '#a4032f', icon: 'te-ao-news' },
    'at mobile':        { colour: '#0073bd', glyph: 'at-mobile',   icon: 'at-mobile' },
  };
  function publisher(app) {
    const p = PUBLISHERS[app.toLowerCase()];
    if (p) return p;
    let hash = 0;   // unknown app: a steady colour from its name, no glyph
    for (const ch of app) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return { colour: `hsl(${hash % 360} 52% 40%)` };
  }
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  // Copy / share a headline (the expanded actions).
  async function share(item) {
    const text = item.headline + ' — ' + item.app;
    if (navigator.share) { try { await navigator.share({ text }); return 'shared'; } catch (e) { /* cancelled */ } }
    return copy(item);
  }
  async function copy(item) {
    try { await navigator.clipboard.writeText(item.headline); return 'copied'; } catch (e) { return 'failed'; }
  }

  window.PushFeed = { CONFIG, start, time, publisher, initials, share, copy };
})();
