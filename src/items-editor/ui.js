/* ===================== Éditeur : interface ===================== */
(function () {
  'use strict';
  const L = window.ItemsLogic;
  const $ = id => document.getElementById(id);
  const SECTION = '§';
  const S = {
    text: '', res: null, sel: -1, lang: 'fr', scale: 2, ascii: null, pack: null, packRead: null,
    fileName: 'items.yml', filter: '', status: 'all', rewrite: null, delArmed: false
  };
  const current = () => (S.res && S.sel >= 0 ? S.res.entries[S.sel] || null : null);

  /* ---------- messages ---------- */
  function say(msg, kind) { const el = $('status'); el.textContent = msg || ''; el.className = 'ie-status' + (kind ? ' ' + kind : ''); }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Champ de formulaire <-> chaîne : les icônes (U+E000-U+FDFF) s'écrivent \uXXXX. */
  function toForm(s) { let o = ''; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o += L.isIcon(c) ? '\\u' + c.toString(16).toUpperCase().padStart(4, '0') : s[i]; } return o; }
  function fromForm(s) { return s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => { const c = parseInt(h, 16); return L.isIcon(c) ? String.fromCharCode(c) : m; }); }

  /** Texte coloré pour la liste (HTML), sans prétention de fidélité. */
  const MC_HEX = ['#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#FFAA00', '#AAAAAA', '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF'];
  function mcHtml(s) {
    let out = '', color = MC_HEX[15], bold = false, italic = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === SECTION && i + 1 < s.length) {
        const k = '0123456789abcdefklmnor'.indexOf(s[i + 1].toLowerCase());
        if (k >= 0 && k < 16) { color = MC_HEX[k]; bold = italic = false; } else if (k === 17) bold = true; else if (k === 20) italic = true; else if (k === 21) { color = MC_HEX[15]; bold = italic = false; }
        i++; continue;
      }
      const c = s.charCodeAt(i);
      out += '<span style="color:' + color + (bold ? ';font-weight:700' : '') + (italic ? ';font-style:italic' : '') + '">' + (L.isIcon(c) ? '▢' : esc(s[i])) + '</span>';
    }
    return out;
  }

  /* ---------- texte -> état ---------- */
  function applyText(text, opts) {
    opts = opts || {};
    S.text = text;
    S.res = L.validateFile(text);
    if (S.pack) for (const r of S.res.entries) r.warnings.push(...L.packWarnings(S.pack, r));
    const n = S.res.entries.length;
    if (opts.selectId !== undefined) {
      const i = S.res.entries.findIndex(r => r.id === opts.selectId && !r.shadowed);
      S.sel = i >= 0 ? i : S.res.entries.findIndex(r => r.id === opts.selectId);
    } else if (opts.selectIndex !== undefined) S.sel = opts.selectIndex;
    if (S.sel >= n) S.sel = n - 1;
    if (S.sel < 0 && n) S.sel = 0;
    if (!opts.fromRaw) $('rawText').value = text;
    renderFile();
    renderList();
    if (!opts.keepForm) renderForm(); else renderFormMeta();
    renderMessages();
    renderPreview();
    renderEntryYaml();
  }

  function stats(r) { return { err: r.errors.length, warn: r.warnings.length }; }
  function renderFile() {
    $('fileName').textContent = S.fileName;
    const v = $('verdict'), res = S.res;
    const box = $('stats');
    box.innerHTML = '';
    if (res.fatal) {
      const e = res.fatal.error;
      v.className = 'st-note st-note-error ie-verdict';
      v.innerHTML = res.fatal.fatal === 'yaml'
        ? '<b>Syntaxe YAML invalide</b>' + (e.line ? ' (ligne ' + e.line + ', colonne ' + e.column + ')' : '') + ' : ' + esc(e.message) + '.<br>Bukkit journalise « Cannot load items.yml » et BeltariaContent démarre avec un catalogue <b>vide</b>, sans autre erreur. <span class="ie-mono">' + esc(L.R.yamlFatal) + '</span>' + (e.snippet ? '<pre>' + esc(e.snippet) + '</pre>' : '') + '<br>Corrigez le texte brut ci-dessous.'
        : '<b>' + esc(e.message) + '</b><br>Bukkit refuse le fichier et BeltariaContent démarre avec un catalogue vide (YamlConfiguration.loadFromString, YamlConfiguration.java:64-84). Un items.yml est un bloc « identifiant: … » à la racine.';
      $('rawDetails').open = true;
      setFormEnabled(false);
      return;
    }
    setFormEnabled(true);
    const all = res.entries.filter(r => !r.shadowed && !r.invisible);
    const nErr = res.entries.filter(r => r.errors.length).length, nWarn = res.entries.filter(r => r.warnings.length).length;
    box.innerHTML = '<span class="st-badge">' + all.length + ' entrée(s) lue(s) par BC</span>'
      + (nErr ? '<span class="st-badge ie-b-err">' + nErr + ' en erreur</span>' : '')
      + (nWarn ? '<span class="st-badge ie-b-warn">' + nWarn + ' avec avertissement</span>' : '')
      + (S.pack ? '<span class="st-badge st-badge-accent">pack : ' + S.pack.ids.size + ' identifiant(s)</span>' : '');
    if (res.firstError) {
      const fe = res.firstError;
      v.className = 'st-note st-note-error ie-verdict';
      v.innerHTML = '<b>BeltariaContent refuserait ce fichier</b> — première erreur rencontrée : <span class="ie-mono">' + esc(fe.error.message) + '</span>'
        + '<br>Au démarrage : le plugin se désactive (« config.yml invalide, plugin desactive : … », BeltariaContent.java:141-150). Au <span class="ie-mono">/content reload</span> : « Rechargement impossible », l\'ancien catalogue reste (ContentCommand.java:270-276).'
        + '<br><button type="button" class="st-btn" id="gotoErr">Aller à ' + esc(fe.entry.id) + '</button>';
      $('gotoErr').addEventListener('click', () => select(fe.entry.index));
    } else if (!all.length) {
      v.className = 'st-note ie-verdict';
      v.textContent = 'Fichier vide : BeltariaContent charge un catalogue vide (ItemsConfig.from sur une racine sans clé). Ajoutez un item ci-dessous.';
    } else {
      v.className = 'st-note st-note-ok ie-verdict';
      v.textContent = 'BeltariaContent chargerait les ' + all.length + ' item(s) de ce fichier.' + (nWarn ? ' Des avertissements signalent ce qu\'il accepterait en silence.' : '');
    }
    const rn = $('rewriteNote');
    const why = res.scan.complex;
    if (why) { rn.hidden = false; rn.textContent = 'Ce fichier ne se découpe pas entrée par entrée (' + why + ') : toute modification le réécrit en entier, sans ses commentaires.'; }
    else if (S.rewrite) { rn.hidden = false; rn.textContent = S.rewrite; }
    else rn.hidden = true;
  }

  function renderList() {
    const list = $('itemList');
    const q = S.filter.trim().toLowerCase();
    const res = S.res;
    let html = '', shown = 0;
    if (res && !res.fatal) {
      res.entries.forEach((r, i) => {
        const st = stats(r);
        if (S.status === 'err' && !st.err) return;
        if (S.status === 'warn' && !st.warn) return;
        const it = r.item;
        const mat = it ? it.material.name : (r.raw && r.raw.get && r.raw.get('material') !== null ? L.javaString(r.raw.get('material')) : '—');
        const name = it && it.name ? it.name : '';
        if (q && !(r.id.toLowerCase().includes(q) || mat.toLowerCase().includes(q) || name.toLowerCase().replace(/§./g, '').includes(q))) return;
        shown++;
        const cls = r.shadowed || r.invisible ? 'off' : (st.err ? 'err' : (st.warn ? 'warn' : ''));
        html += '<button type="button" class="ie-item" role="listitem" data-i="' + i + '"' + (i === S.sel ? ' aria-current="true"' : '') + '>'
          + '<span class="ie-dot ' + cls + '" title="' + (st.err ? st.err + ' erreur(s)' : st.warn ? st.warn + ' avertissement(s)' : 'valide') + '"></span>'
          + '<span class="ie-item-id">' + esc(r.id) + '</span>'
          + '<span class="ie-item-meta">' + esc(mat) + (name ? ' · ' + mcHtml(name) : '') + '</span></button>';
      });
    }
    list.innerHTML = html || '<p class="st-empty">Aucun item' + (q || S.status !== 'all' ? ' pour ce filtre' : '') + '.</p>';
    $('listCount').textContent = res && !res.fatal ? String(res.entries.length) : '0';
    const cur = list.querySelector('[aria-current="true"]');
    if (cur && cur.scrollIntoView && !S.noScroll) cur.scrollIntoView({ block: 'nearest' });
  }

  function select(i) {
    flushPending();
    S.sel = i;
    S.rewrite = null;
    renderFile();
    renderList();
    renderForm();
    renderMessages();
    renderPreview();
    renderEntryYaml();
  }

  /* ---------- formulaire ---------- */
  function setFormEnabled(on) {
    for (const el of $('editPanel').querySelectorAll('input, select, textarea, button')) el.disabled = !on;
    for (const id of ['dupBtn', 'delBtn', 'addBtn', 'newId']) $(id).disabled = !on;
  }
  const rawOf = (r, k) => (r && r.raw && r.raw.get ? r.raw.get(k) : null);
  function rawText(v) { return v === null || v === undefined ? '' : L.javaString(v); }

  function renderForm() {
    const r = current();
    $('editEmpty').hidden = !!r;
    $('editForm').hidden = !r;
    if (!r) return;
    const editable = r.raw instanceof L.Sec;
    $('fId').value = r.id;
    $('fMaterial').value = rawText(rawOf(r, 'material'));
    const num = v => (v instanceof L.JNum ? v.toString() : '');
    $('fData').value = num(rawOf(r, 'data'));
    $('fAmount').value = num(rawOf(r, 'amount'));
    $('fName').value = r.raw && r.raw.has && r.raw.has('name') ? toForm(rawText(rawOf(r, 'name'))) : '';
    const lore = rawOf(r, 'lore');
    $('fLore').value = Array.isArray(lore) ? lore.filter(x => typeof x === 'string' || typeof x === 'boolean' || x instanceof L.JNum).map(x => toForm(L.javaString(x))).join('\n') : '';
    renderEnchRows();
    const flags = rawOf(r, 'flags');
    const fl = Array.isArray(flags) ? flags.map(x => L.javaString(x).trim().toUpperCase()) : [];
    for (const box of $('flagBoxes').querySelectorAll('input')) box.checked = fl.includes(box.value);
    S.extraFlags = Array.isArray(flags) ? flags.map(x => L.javaString(x)).filter(x => !L.FLAGS.includes(x.trim().toUpperCase())) : [];
    $('fUnbreakable').checked = rawOf(r, 'unbreakable') === true;
    const hasMarker = r.raw && r.raw.has && r.raw.has('marker');
    const mv = hasMarker ? rawText(rawOf(r, 'marker')) : '';
    $('fMarkerMode').value = !hasMarker ? 'default' : (mv === '' ? 'none' : 'custom');
    $('fMarker').value = hasMarker ? mv : '';
    $('fMarker').hidden = $('fMarkerMode').value !== 'custom';
    const blk = rawOf(r, 'block');
    $('fBlock').checked = blk !== null;
    const bget = k => (blk instanceof L.Sec ? blk.get(k) : null);
    const anchor = bget('anchor') === null ? 'NOTE_BLOCK' : rawText(bget('anchor')).toUpperCase();
    const sel = $('fAnchor');
    if (![...sel.options].some(o => o.value === anchor)) { const o = document.createElement('option'); o.value = anchor; o.textContent = anchor + ' (refusé)'; sel.appendChild(o); }
    sel.value = anchor;
    $('fSpin').value = num(bget('spin'));
    $('fBob').value = num(bget('bob'));
    $('blockFields').hidden = !$('fBlock').checked;
    const unknown = r.raw instanceof L.Sec ? r.raw.keys().filter(k => !L.ENTRY_KEYS.includes(k)) : [];
    $('unknownWrap').hidden = !unknown.length;
    $('unknownKeys').innerHTML = unknown.map(k => '<li>' + esc(k) + ': ' + esc(L.javaString(r.raw.get(k))) + '</li>').join('');
    for (const el of $('editForm').querySelectorAll('input, select, textarea, button')) if (el.id !== 'fId') el.disabled = !editable;
  }
  function renderFormMeta() {
    // Le formulaire garde la saisie en cours ; seule la liste des clés ignorées suit le texte.
    const r = current();
    if (!r) return;
    const unknown = r.raw instanceof L.Sec ? r.raw.keys().filter(k => !L.ENTRY_KEYS.includes(k)) : [];
    $('unknownWrap').hidden = !unknown.length;
    $('unknownKeys').innerHTML = unknown.map(k => '<li>' + esc(k) + ': ' + esc(L.javaString(r.raw.get(k))) + '</li>').join('');
  }

  function enchLabel(e, lang) { return e.key + ' — ' + L.tr(lang || 'fr', e.lang) + ' (max. vanilla ' + e.max + ')'; }
  function enchOptions(selected) {
    let html = L.ENCHANTS.map(e => '<option value="' + e.key + '"' + (e.key === selected ? ' selected' : '') + '>' + esc(enchLabel(e)) + '</option>').join('');
    if (selected && !L.ENCHANTS.some(e => e.key === selected)) html = '<option value="' + esc(selected) + '" selected>' + esc(selected) + ' (inconnu)</option>' + html;
    return html;
  }
  function renderEnchRows() {
    const r = current();
    const sec = rawOf(r, 'enchantments');
    const rows = sec instanceof L.Sec ? sec.keys().map(k => [k, L.javaString(sec.get(k))]) : [];
    const box = $('enchRows');
    box.innerHTML = '';
    rows.forEach(([k, lv]) => addEnchRow(k, lv));
    if (sec !== null && !(sec instanceof L.Sec)) box.innerHTML = '<p class="st-empty">enchantments n\'est pas un bloc : corrigez-le dans le texte brut.</p>';
  }
  function addEnchRow(key, level) {
    const row = document.createElement('div');
    row.className = 'ie-ench-row';
    const known = L.enchantmentByName(key);
    row.innerHTML = '<select class="st-select" aria-label="Enchantement">' + enchOptions(known ? known.key : key) + '</select>'
      + '<input type="number" class="st-input" step="1" aria-label="Niveau" value="' + esc(level) + '">'
      + '<button type="button" class="st-btn st-btn-danger" aria-label="Retirer">×</button>';
    row.dataset.key = key;
    row.querySelector('select').addEventListener('change', e => { row.dataset.key = e.target.value; commitEnchants(); });
    row.querySelector('input').addEventListener('input', debounce(commitEnchants, 200));
    row.querySelector('button').addEventListener('click', () => { row.remove(); commitEnchants(); });
    $('enchRows').appendChild(row);
  }

  /* ---------- formulaire -> texte (édition ciblée) ---------- */
  function target() { const r = current(); return { index: r.index, id: r.bukkitId }; }
  function commit(key, value) {
    flushPending();
    const r = current();
    if (!r) return;
    try {
      const out = L.setChild(S.text, target(), key, value);
      S.rewrite = out.rewritten === 'entry' ? 'L\'entrée « ' + r.id + ' » n\'était pas découpable clé par clé (' + (r.scan && r.scan.bad) + ') : elle a été réécrite en entier, sans ses commentaires internes.' : (out.rewritten === 'file' ? 'Fichier réécrit en entier.' : null);
      S.noScroll = true;
      applyText(out.text, { keepForm: true, selectIndex: S.sel });
      S.noScroll = false;
    } catch (e) { say(e.message, 'error'); }
  }
  const num = s => { s = s.trim(); if (s === '') return null; return /^[-+]?\d+(\.\d+)?$/.test(s) ? { t: 'plain', v: s } : { t: 'str', v: s }; };
  function commitEnchants() {
    const rows = [...$('enchRows').querySelectorAll('.ie-ench-row')];
    const entries = rows.map(row => [row.dataset.key, num(row.querySelector('input').value) || { t: 'plain', v: '1' }]);
    commit('enchantments', entries.length ? { t: 'map', entries } : null);
  }
  function commitFlags() {
    const items = [...$('flagBoxes').querySelectorAll('input:checked')].map(b => b.value).concat(S.extraFlags || []);
    commit('flags', items.length ? { t: 'list', items: items.map(v => ({ t: 'plain', v: L.plainOrQuoted(v) })), flow: S.res.scan.style.flowFlags } : null);
  }
  function commitBlock() {
    $('blockFields').hidden = !$('fBlock').checked;
    if (!$('fBlock').checked) { commit('block', null); return; }
    const entries = [['anchor', { t: 'plain', v: L.plainOrQuoted($('fAnchor').value) }]];
    const spin = num($('fSpin').value), bob = num($('fBob').value);
    if (spin) entries.push(['spin', spin]);
    if (bob) entries.push(['bob', bob]);
    const blk = rawOf(current(), 'block');
    if (blk instanceof L.Sec) for (const k of blk.keys()) if (!['anchor', 'spin', 'bob'].includes(k)) entries.push([k, L.typed(blk.get(k))]);
    commit('block', { t: 'map', entries });
  }
  function commitMarker() {
    const mode = $('fMarkerMode').value;
    $('fMarker').hidden = mode !== 'custom';
    if (mode === 'default') commit('marker', null);
    else if (mode === 'none') commit('marker', { t: 'str', v: '' });
    else commit('marker', { t: 'str', v: $('fMarker').value });
  }
  /** Saisie différée ; toute écriture vide d'abord les saisies en attente, pour qu'aucune ne se perde. */
  const pending = new Set();
  function debounce(fn, ms) {
    let t = 0;
    const run = () => { if (!pending.delete(run)) return; clearTimeout(t); fn(); };
    return function () { clearTimeout(t); pending.add(run); t = setTimeout(run, ms); };
  }
  function flushPending() { for (const run of [...pending]) run(); }

  function wireForm() {
    $('fMaterial').addEventListener('input', debounce(() => { const v = $('fMaterial').value.trim(); commit('material', v ? { t: 'plain', v: L.plainOrQuoted(v) } : null); }, 200));
    $('fData').addEventListener('input', debounce(() => commit('data', num($('fData').value)), 200));
    $('fAmount').addEventListener('input', debounce(() => commit('amount', num($('fAmount').value)), 200));
    $('fName').addEventListener('input', debounce(() => { const v = fromForm($('fName').value); commit('name', v === '' ? null : { t: 'str', v }); }, 150));
    $('fLore').addEventListener('input', debounce(() => {
      const v = $('fLore').value;
      commit('lore', v === '' ? null : { t: 'list', items: v.split('\n').map(l => ({ t: 'str', v: fromForm(l) })) });
    }, 150));
    $('flagBoxes').addEventListener('change', commitFlags);
    $('fUnbreakable').addEventListener('change', () => commit('unbreakable', $('fUnbreakable').checked ? { t: 'plain', v: 'true' } : null));
    $('fMarkerMode').addEventListener('change', commitMarker);
    $('fMarker').addEventListener('input', debounce(commitMarker, 200));
    $('fBlock').addEventListener('change', commitBlock);
    $('fAnchor').addEventListener('change', commitBlock);
    $('fSpin').addEventListener('input', debounce(commitBlock, 200));
    $('fBob').addEventListener('input', debounce(commitBlock, 200));
    $('enchAdd').addEventListener('click', () => {
      const key = $('enchSelect').value;
      const existing = [...$('enchRows').querySelectorAll('.ie-ench-row')].find(r => L.enchantmentByName(r.dataset.key) === L.enchantmentByName(key));
      if (existing) existing.querySelector('input').value = $('enchLevel').value || '1';
      else addEnchRow(key, $('enchLevel').value || '1');
      commitEnchants();
    });
    $('fId').addEventListener('change', () => {
      flushPending();
      const r = current();
      const id = $('fId').value.trim();
      if (!r || id === r.id || !id) { $('fId').value = r ? r.id : ''; return; }
      if (S.res.entries.some(x => x.id === id)) { say('« ' + id + ' » existe déjà.', 'error'); $('fId').value = r.id; return; }
      applyText(L.renameEntry(S.text, target(), id), { selectId: id });
      say('Renommé en « ' + id + ' ».', 'ok');
    });
    // Palette : insère &x au curseur du dernier champ utilisé (nom ou lore)
    let codeTarget = $('fLore');
    ['fName', 'fLore'].forEach(id => $(id).addEventListener('focus', e => { codeTarget = e.target; }));
    const NAMES = { 0: 'Noir', 1: 'Bleu foncé', 2: 'Vert foncé', 3: 'Cyan foncé', 4: 'Rouge foncé', 5: 'Violet', 6: 'Or', 7: 'Gris', 8: 'Gris foncé', 9: 'Bleu', a: 'Vert', b: 'Aqua', c: 'Rouge', d: 'Rose', e: 'Jaune', f: 'Blanc' };
    const FORMATS = [['l', 'Gras'], ['o', 'Italique'], ['n', 'Souligné'], ['m', 'Barré'], ['k', 'Brouillé'], ['r', 'Réinitialiser']];
    const palette = $('codePalette');
    const add = (code, label, swatch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'code-btn' + (swatch ? ' swatch' : '') + (swatch && '7abef'.includes(code) ? ' light' : '');
      b.textContent = code;
      b.title = '&' + code + ' — ' + label;
      b.setAttribute('aria-label', 'Insérer &' + code + ' (' + label + ')');
      if (swatch) b.style.background = swatch;
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => {
        const f = codeTarget;
        const start = f.selectionStart ?? f.value.length, end = f.selectionEnd ?? start;
        f.value = f.value.slice(0, start) + '&' + code + f.value.slice(end);
        f.focus();
        f.setSelectionRange(start + 2, start + 2);
        f.dispatchEvent(new Event('input'));
      });
      palette.appendChild(b);
    };
    Object.keys(NAMES).forEach((c, i) => add(c, NAMES[c], MC_HEX[i]));
    const sep = document.createElement('span'); sep.className = 'codes-sep'; palette.appendChild(sep);
    FORMATS.forEach(([c, l]) => add(c, l, null));
  }

  /* ---------- messages par champ ---------- */
  const FIELD_BOX = { id: 'id', entry: 'entry', material: 'material', data: 'data', amount: 'amount', name: 'name', lore: 'lore', enchantments: 'enchantments', flags: 'flags', unbreakable: 'unbreakable', marker: 'marker', block: 'block', unknown: 'unknown' };
  function renderMessages() {
    for (const box of document.querySelectorAll('[data-msgs]')) box.innerHTML = '';
    const r = current();
    if (!r) return;
    const put = (field, cls, html) => { const box = document.querySelector('[data-msgs="' + (FIELD_BOX[field] || 'entry') + '"]'); if (box) box.insertAdjacentHTML('beforeend', '<div class="ie-msg ' + cls + '">' + html + '</div>'); };
    const isFirst = S.res.firstError && S.res.firstError.entry === r;
    r.errors.forEach((e, i) => put(e.field, 'err', (i === 0 && isFirst ? '<span class="first">BC s\'arrête ici : </span>' : '') + '<span class="ie-mono">' + esc(e.message) + '</span><span class="ref">' + esc(e.ref) + '</span>'));
    r.warnings.forEach(w => put(w.field, 'warn', esc(w.message) + '<span class="ref">' + esc(w.ref) + '</span>'));
    r.infos.forEach(w => put(w.field, 'info', esc(w.message) + '<span class="ref">' + esc(w.ref) + '</span>'));
  }

  /* ---------- YAML de l'entrée ---------- */
  function entryText(r) {
    if (!r) return '';
    if (r.scan && !S.res.scan.complex) return S.res.scan.lines.slice(r.scan.line, r.scan.bodyEnd + 1).join('\n');
    const f = r.raw instanceof L.Sec ? r.raw.keys().map(k => [k, L.typed(r.raw.get(k))]) : [];
    return L.serEntry(r.id, f, S.res.scan.style).join('\n');
  }
  function renderEntryYaml() { $('entryYaml').textContent = entryText(current()); }

  /* ---------- FontRenderer 1.8.9 (porté du Vérificateur d'icônes) ---------- */
  const ASCII_TABLE = "ÀÁÂÈÊËÍÓÔÕÚßãõğİıŒœŞşŴŵžȇ\u0000\u0000\u0000\u0000\u0000\u0000\u0000 !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u0000ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αβΓπΣσμτΦΘΩδ∞∅∈∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u0000";
  const STYLE_CODES = '0123456789abcdefklmnor';
  // Largeurs d'ascii.png du client 1.8.9 (FontRenderer.readFontTexture, FontRenderer.java:140-181) : la mise en page
  // est exacte même sans charger le .jar ; seul le dessin des lettres est alors approché.
  const VANILLA_WIDTHS = [6,6,6,6,6,6,4,6,6,6,6,6,6,6,6,4,4,6,7,6,6,6,6,6,6,1,1,1,1,1,1,1,4,2,5,6,6,6,6,3,5,5,5,6,2,6,2,6,6,6,6,6,6,6,6,6,6,6,2,2,5,6,5,6,7,6,6,6,6,6,6,6,6,4,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,4,6,4,6,6,3,6,6,6,6,6,5,6,6,2,6,5,3,6,6,6,6,6,6,6,4,6,6,6,6,6,6,5,2,5,7,6,6,6,6,6,6,6,6,6,6,6,6,4,6,3,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,4,6,6,3,6,6,6,6,6,6,6,7,6,6,6,2,6,6,8,9,9,6,6,6,8,8,6,8,8,8,8,8,6,6,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,6,9,9,9,5,9,9,8,7,7,8,7,8,8,8,7,8,8,7,9,9,6,7,7,7,7,7,9,6,7,8,7,6,6,9,7,6,7,1];
  const asciiIndex = c => ASCII_TABLE.indexOf(String.fromCharCode(c));
  function mcColorTable() {                                   // FontRenderer constructor (anaglyph off)
    const t = [];
    for (let i = 0; i < 32; i++) {
      const j = ((i >> 3) & 1) * 85;
      let k = ((i >> 2) & 1) * 170 + j, l = ((i >> 1) & 1) * 170 + j, m = (i & 1) * 170 + j;
      if (i === 6) k += 85;
      if (i >= 16) { k = (k / 4) | 0; l = (l / 4) | 0; m = (m / 4) | 0; }
      t.push(((k & 255) << 16) | ((l & 255) << 8) | (m & 255));
    }
    return t;
  }
  const COLORS = mcColorTable();
  function asciiWidths(rgba, w, h) {                          // FontRenderer.readFontTexture
    const cw = w / 16, ch = h / 16, f = 8 / cw, out = new Array(256);
    for (let c = 0; c < 256; c++) {
      const cx = c % 16, cy = (c / 16) | 0;
      let col;
      for (col = cw - 1; col >= 0; col--) {
        let empty = true;
        for (let y = 0; y < ch && empty; y++) if (rgba[((cy * ch + y) * w + cx * cw + col) * 4 + 3] !== 0) empty = false;
        if (!empty) break;
      }
      col++;
      out[c] = Math.trunc(0.5 + col * f) + 1;
    }
    out[32] = 4;
    return out;
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  function webCharWidth(ch) { measureCtx.font = '8px monospace'; return Math.max(1, Math.round(measureCtx.measureText(ch).width)); }
  function asciiWidth(j) { return S.ascii ? S.ascii.widths[j] : VANILLA_WIDTHS[j]; }
  function uiCharWidth(c) {
    if (c === 167) return -1;
    if (c === 32) return 4;
    const j = asciiIndex(c);
    if (c > 0 && j !== -1) return asciiWidth(j);
    if (L.isIcon(c)) return 9;
    return webCharWidth(String.fromCharCode(c));
  }
  function uiStringWidth(text) {                              // getStringWidth
    let w = 0, bold = false;
    for (let i = 0; i < text.length; i++) {
      let k = uiCharWidth(text.charCodeAt(i));
      if (k < 0 && i < text.length - 1) {
        const c = text.charCodeAt(++i);
        if (c !== 108 && c !== 76) { if (c === 114 || c === 82) bold = false; } else bold = true;
        k = 0;
      }
      w += k;
      if (bold && k > 0) w++;
    }
    return w;
  }
  const quadCache = new Map();
  function quad(key, tex, texDim, texPerUnit, u0, v0, k, quadW, italic, rgb, s) {
    const ck = key + '|' + rgb + '|' + s + '|' + (italic ? 1 : 0);
    if (quadCache.has(ck)) return quadCache.get(ck);
    let res = null;
    if (quadW > 0) {
      const f5 = italic ? 1 : 0, h = 7.99;
      const x0 = Math.floor(-f5 * s) - 1, x1 = Math.ceil((quadW + f5) * s) + 1, H = Math.ceil(h * s), W = x1 - x0;
      const img = new ImageData(W, H), d = img.data, t = tex;
      const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
      let any = false;
      for (let py = 0; py < H; py++) {
        const gy = (py + 0.5) / s;
        if (gy >= h) continue;
        const xl = f5 - 2 * f5 * (gy / h);
        const ty = Math.min(texDim - 1, Math.floor((v0 + gy * k) * texPerUnit));
        for (let px = 0; px < W; px++) {
          const gx = (x0 + px + 0.5) / s;
          if (gx < xl || gx >= xl + quadW) continue;
          const tx = Math.min(texDim - 1, Math.floor((u0 + (gx - xl) * k) * texPerUnit));
          const si = (ty * texDim + tx) * 4, a = t[si + 3];
          if (!a) continue;
          const di = (py * W + px) * 4;
          d[di] = t[si] * r / 255; d[di + 1] = t[si + 1] * g / 255; d[di + 2] = t[si + 2] * b / 255; d[di + 3] = a;
          any = true;
        }
      }
      if (any) {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').putImageData(img, 0, 0);
        res = { canvas: c, ox: x0 };
      }
    }
    quadCache.set(ck, res);
    return res;
  }
  function webChar(ctx, code, st, s) {
    const ch = String.fromCharCode(code);
    ctx.save();
    ctx.translate(st.x * s, st.y * s);
    if (st.italic) ctx.transform(1, 0, -0.25, 1, s, 0);
    ctx.fillStyle = '#' + st.rgb.toString(16).padStart(6, '0');
    ctx.font = (8 * s) + 'px monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, 0, 7 * s);
    ctx.restore();
    return webCharWidth(ch);
  }
  /** Icône (U+E000-U+FDFF) : son dessin vient du pack ; ici une case de 8 px. */
  function iconBox(ctx, st, s) {
    ctx.fillStyle = '#' + st.rgb.toString(16).padStart(6, '0');
    ctx.fillRect(st.x * s, st.y * s, 8 * s, s);
    ctx.fillRect(st.x * s, (st.y + 7) * s, 8 * s, s);
    ctx.fillRect(st.x * s, st.y * s, s, 8 * s);
    ctx.fillRect((st.x + 7) * s, st.y * s, s, 8 * s);
    return 9;
  }
  function renderChar(ctx, code, j, st, s) {
    if (code === 32) return 4;
    if (j !== -1) {
      if (S.ascii) {                                          // renderDefaultChar
        const a = S.ascii, l = a.widths[j], f1 = l - 0.01;
        const q = quad('a' + j + ':' + a.size, a.data, a.size, a.size / 128, (j % 16) * 8, ((j / 16) | 0) * 8, 1, f1 - 1, st.italic, st.rgb, s);
        if (q) ctx.drawImage(q.canvas, st.x * s + q.ox, st.y * s);
        return l;
      }
      webChar(ctx, code, st, s);
      return VANILLA_WIDTHS[j];
    }
    if (L.isIcon(code)) return iconBox(ctx, st, s);
    return webChar(ctx, code, st, s);
  }
  function renderString(ctx, text, x, y, color, shadow, s) {   // renderStringAtPos
    if (shadow) color = (color & 0xFCFCFC) >> 2;
    const st = { x, y, rgb: color & 0xFFFFFF, bold: false, italic: false, under: false, strike: false };
    const base = st.rgb;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 167 && i + 1 < text.length) {
        let k = STYLE_CODES.indexOf(text[i + 1].toLowerCase());
        if (k < 16) {
          st.bold = st.italic = st.under = st.strike = false;
          if (k < 0 || k > 15) k = 15;
          if (shadow) k += 16;
          st.rgb = COLORS[k];
        } else if (k === 17) st.bold = true;
        else if (k === 18) st.strike = true;
        else if (k === 19) st.under = true;
        else if (k === 20) st.italic = true;
        else if (k === 21) { st.bold = st.italic = st.under = st.strike = false; st.rgb = base; }
        i++;
        continue;
      }
      const j = asciiIndex(code);
      const flag = (code === 0 || j === -1) && shadow;
      if (flag) { st.x -= 1; st.y -= 1; }
      let f = renderChar(ctx, code, j, st, s);
      if (flag) { st.x += 1; st.y += 1; }
      if (st.bold) {
        st.x += 1;
        if (flag) { st.x -= 1; st.y -= 1; }
        renderChar(ctx, code, j, st, s);
        st.x -= 1;
        if (flag) { st.x += 1; st.y += 1; }
        f++;
      }
      const css = '#' + st.rgb.toString(16).padStart(6, '0');
      if (st.strike) { ctx.fillStyle = css; ctx.fillRect(st.x * s, (st.y + 3) * s, f * s, s); }
      if (st.under) { ctx.fillStyle = css; ctx.fillRect((st.x - 1) * s, (st.y + 8) * s, (f + 1) * s, s); }
      st.x += Math.trunc(f);
    }
    return st.x;
  }
  function drawStringWithShadow(ctx, text, x, y, s) {
    renderString(ctx, text, x + 1, y + 1, 0xFFFFFF, true, s);
    return renderString(ctx, text, x, y, 0xFFFFFF, false, s);
  }
  function argbCss(argb) { return 'rgba(' + ((argb >> 16) & 255) + ',' + ((argb >> 8) & 255) + ',' + (argb & 255) + ',' + (((argb >>> 24) & 255) / 255) + ')'; }
  /** Gui.drawGradientRect : dégradé vertical, interpolé par ligne de pixels comme le fait GL. */
  function gradientRect(ctx, s, x0, y0, x1, y1, top, bottom) {
    const H = (y1 - y0) * s;
    if (top === bottom) { ctx.fillStyle = argbCss(top); ctx.fillRect(x0 * s, y0 * s, (x1 - x0) * s, H); return; }
    const ch = (c, sh) => (c >>> sh) & 255;
    for (let py = 0; py < H; py++) {
      const t = (py + 0.5) / H, mix = sh => Math.round(ch(top, sh) * (1 - t) + ch(bottom, sh) * t);
      ctx.fillStyle = 'rgba(' + mix(16) + ',' + mix(8) + ',' + mix(0) + ',' + (mix(24) / 255) + ')';
      ctx.fillRect(x0 * s, y0 * s + py, (x1 - x0) * s, 1);
    }
  }
  /** GuiScreen.drawHoveringText (1.8.9), dans un canevas à l'échelle GUI choisie. */
  function drawTooltip(cv, lines, s) {
    let w = 0;
    for (const l of lines) w = Math.max(w, uiStringWidth(l));
    const h = lines.length > 1 ? 8 + 2 + (lines.length - 1) * 10 : 8;
    const ox = 4, oy = 4, W = w + 8, Hh = h + 8;
    cv.width = Math.max(1, W * s); cv.height = Math.max(1, Hh * s);
    cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const bg = 0xF0100010, b1 = 0x505000FF, b2 = 0x5028007F;
    gradientRect(ctx, s, ox - 3, oy - 4, ox + w + 3, oy - 3, bg, bg);
    gradientRect(ctx, s, ox - 3, oy + h + 3, ox + w + 3, oy + h + 4, bg, bg);
    gradientRect(ctx, s, ox - 3, oy - 3, ox + w + 3, oy + h + 3, bg, bg);
    gradientRect(ctx, s, ox - 4, oy - 3, ox - 3, oy + h + 3, bg, bg);
    gradientRect(ctx, s, ox + w + 3, oy - 3, ox + w + 4, oy + h + 3, bg, bg);
    gradientRect(ctx, s, ox - 3, oy - 3 + 1, ox - 3 + 1, oy + h + 3 - 1, b1, b2);
    gradientRect(ctx, s, ox + w + 2, oy - 3 + 1, ox + w + 3, oy + h + 3 - 1, b1, b2);
    gradientRect(ctx, s, ox - 3, oy - 3, ox + w + 3, oy - 3 + 1, b1, b1);
    gradientRect(ctx, s, ox - 3, oy + h + 2, ox + w + 3, oy + h + 3, b2, b2);
    let y = oy;
    lines.forEach((line, i) => { drawStringWithShadow(ctx, line, ox, y, s); if (i === 0) y += 2; y += 10; });
    return { width: w, height: h };
  }

  /* ---------- aperçu ---------- */
  function renderPreview() {
    const r = current();
    const notes = [];
    const cv = $('tipCanvas');
    let lines = [];
    if (!r || !r.item) {
      cv.width = cv.height = 1;
      cv.style.width = cv.style.height = '1px';
      notes.push(r ? 'Pas d\'aperçu : la matière est absente ou refusée.' : 'Aucun item sélectionné.');
    } else {
      const t = L.tooltip(r.item, S.lang);
      lines = t.lines;
      notes.push(...t.notes);
      if (lines.length) {
        const size = drawTooltip(cv, lines, S.scale);
        cv.dataset.lines = String(lines.length);
        cv.dataset.width = String(size.width);
      } else { cv.width = cv.height = 1; cv.style.width = cv.style.height = '1px'; }
      if (r.item.lore.concat(r.item.name || '').some(x => /[-﷿]/.test(x))) notes.push('Les cases sont des icônes du pack : vérifiez leur rendu dans le Vérificateur d\'icônes (glyph-checker.html). items.yml ne passe pas par PlaceholderAPI.');
      if (lines.some(l => /§k/.test(l))) notes.push('§k (brouillé) est dessiné tel quel, sans l\'animation du client.');
      if (lines.some(l => /\d\.\d/.test(l) && /§9\+/.test(l))) notes.push('Les décimales suivent la locale de Java du client (DecimalFormat « #.### ») : « , » sur un système français.');
    }
    notes.push(S.ascii ? 'Texte rendu avec ascii.png du client (' + S.ascii.origin + ') : largeurs et pixels exacts.' : 'Largeurs exactes (table d\'ascii.png 1.8.9) mais lettres dessinées avec une police de repli : chargez le 1.8.9.jar pour les pixels exacts.');
    $('tipNotes').innerHTML = notes.map(n => '<li>' + esc(n) + '</li>').join('');
    $('tipLines').textContent = lines.map(l => l.replace(/§/g, '§')).join('\n');
    const icon = $('itemIcon');
    const rule = r && r.item && S.pack ? L.packRuleFor(S.pack, r.item.marker) : null;
    if (rule && rule.texture && S.packRead) {
      const path = rule.texture;
      icon.hidden = false;
      if (icon.dataset.path !== path) {
        icon.dataset.path = path;
        S.packRead(path).then(bytes => { if (icon.dataset.path === path) { if (icon.src.startsWith('blob:')) URL.revokeObjectURL(icon.src); icon.src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); } }).catch(() => { icon.hidden = true; });
      }
      icon.alt = 'Texture du pack : ' + path;
    } else { icon.hidden = true; icon.dataset.path = ''; }
  }

  /* ---------- zip (lecture seule) ---------- */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function readZipIndex(u8) {
    if (u8.length < 22) throw new Error('Archive .zip/.jar invalide (fichier trop court).');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Archive .zip/.jar invalide (répertoire central introuvable).');
    const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder(), entries = new Map();
    let p = cdOff;
    for (let i = 0; i < count; i++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('Archive .zip/.jar corrompue (entrée ' + (i + 1) + ').');
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      entries.set(name, { name, flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true), compSize: dv.getUint32(p + 20, true), size: dv.getUint32(p + 24, true), offset: dv.getUint32(p + 42, true) });
      p += 46 + nlen + elen + clen;
    }
    return entries;
  }
  async function extractZipEntry(u8, e) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (e.flags & 1) throw new Error('Fichier chiffré : ' + e.name);
    const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
    const comp = u8.subarray(start, start + e.compSize);
    let data;
    if (e.method === 0) data = new Uint8Array(comp);
    else if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser les zip.');
      data = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else throw new Error('Compression ' + e.method + ' non prise en charge : ' + e.name);
    if (data.length !== e.size || crc32(data) !== e.crc) throw new Error('Fichier corrompu (CRC) : ' + e.name);
    return data;
  }

  /* ---------- chargements ---------- */
  const decodeText = bytes => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  function loadYaml(text, name) {
    pending.clear();
    S.fileName = name || 'items.yml';
    S.rewrite = null;
    applyText(text, { selectIndex: 0 });
    const res = S.res;
    say(res.fatal ? name + ' chargé : illisible pour Bukkit.' : name + ' chargé : ' + res.entries.length + ' entrée(s).', res.fatal ? 'error' : 'ok');
  }
  /** files : [{path, read}] — dossier du plugin, pack-src, ou leur zip. */
  async function loadTree(files, label) {
    const norm = files.map(f => ({ path: f.path.replace(/\\/g, '/'), read: f.read }));
    const ymls = norm.filter(f => /(^|\/)items\.yml$/i.test(f.path)).sort((a, b) => a.path.length - b.path.length);
    const descs = norm.filter(f => /(^|\/)pack\.json$/i.test(f.path) && norm.some(g => g.path.startsWith(f.path.replace(/pack\.json$/i, '')) && /^(items|blocks|armor)\//.test(g.path.slice(f.path.length - 9)))).sort((a, b) => a.path.length - b.path.length);
    const msgs = [];
    if (descs.length) {
      const d = descs[0], root = d.path.slice(0, d.path.length - 'pack.json'.length);
      let desc = {};
      try { desc = JSON.parse(decodeText(await d.read())); } catch (e) { msgs.push('pack.json illisible (' + e.message + ')'); }
      const rel = norm.filter(f => f.path.startsWith(root)).map(f => f.path.slice(root.length));
      S.pack = L.packIndex(rel, desc);
      const byRel = new Map(norm.filter(f => f.path.startsWith(root)).map(f => [f.path.slice(root.length), f]));
      S.packRead = p => (byRel.has(p) ? byRel.get(p).read() : Promise.reject(new Error('absent')));
      msgs.push('pack « ' + (root || label) + ' » : ' + S.pack.ids.size + ' identifiant(s)');
    }
    if (ymls.length) {
      const y = ymls[0];
      S.fileName = 'items.yml';
      loadYaml(decodeText(await y.read()), y.path);
      msgs.unshift(y.path + ' chargé');
    } else if (S.res) applyText(S.text, { selectIndex: S.sel });
    renderPack();
    if (!msgs.length) say('Ni items.yml ni pack.json trouvés dans ' + label + '.', 'error');
    else say(msgs.join(' ; ') + '.', 'ok');
  }
  function renderPack() {
    const det = $('packDetails');
    const dl = $('packIds');
    if (!S.pack) { det.hidden = true; dl.innerHTML = ''; return; }
    det.hidden = false;
    const ids = [...S.pack.ids.values()].sort((a, b) => a.id.localeCompare(b.id));
    $('packCount').textContent = String(ids.length);
    const inFile = new Set(S.res && !S.res.fatal ? S.res.entries.map(r => (r.item ? r.item.marker : null)).filter(Boolean) : []);
    const missing = ids.filter(o => !inFile.has(o.id));
    $('packInfo').textContent = missing.length + ' identifiant(s) du pack sans entrée dans items.yml (dossiers items/, blocks/, armor/<set>/<pièce>.png).';
    $('packList').innerHTML = missing.concat(ids.filter(o => inFile.has(o.id))).map(o => '<div class="ie-pack-row"><span class="ie-mono" title="' + esc(o.cat + (o.material ? ' — ' + o.material.name : '')) + '">' + esc(o.id) + ' <small class="st-muted">' + esc(o.cat) + '</small></span>'
      + (inFile.has(o.id) ? '<span class="st-badge st-badge-ok">dans items.yml</span>' : '<button type="button" class="st-btn st-btn-soft" data-pack="' + esc(o.id) + '">Ajouter</button>') + '</div>').join('');
    dl.innerHTML = ids.map(o => '<option value="' + esc(o.id) + '">').join('');
  }
  function titleCase(id) { return id.split(/[_-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' '); }
  function addItem(id, fromPack) {
    flushPending();
    if (!L.ID_RE.test(id)) { say('Identifiant attendu en minuscules, chiffres, _ ou - (ItemsConfig.java:53).', 'error'); return; }
    if (S.res && S.res.entries.some(r => r.id === id)) { say('« ' + id + ' » existe déjà.', 'error'); return; }
    const p = S.pack && S.pack.ids.get(id);
    const mat = p && p.material ? p.material.name : 'PAPER';
    const fields = [['material', { t: 'plain', v: mat }], ['name', { t: 'str', v: '&f' + titleCase(id) }]];
    applyText(L.addEntry(S.res && !S.res.fatal ? S.text : (S.text.trim() ? S.text : ''), id, fields), { selectId: id });
    say('« ' + id + ' » ajouté' + (p ? ' (matière ' + mat + ' d\'après le pack)' : ' (matière PAPER, la convention du serveur pour ce qui n\'est ni arme, ni armure)') + '.', 'ok');
    if (fromPack) renderPack();
  }

  async function loadFont(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let png = bytes, origin = file.name;
    if (!(bytes[0] === 0x89 && bytes[1] === 0x50)) {
      const idx = readZipIndex(bytes);
      const e = idx.get('assets/minecraft/textures/font/ascii.png');
      if (!e) throw new Error('assets/minecraft/textures/font/ascii.png absent de ' + file.name + '.');
      png = await extractZipEntry(bytes, e);
      origin = file.name + '!/ascii.png';
    }
    const bmp = await createImageBitmap(new Blob([png]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    if (img.width !== img.height || img.width < 128 || (img.width & (img.width - 1))) throw new Error('ascii.png doit être carré, puissance de deux, au moins 128 px.');
    S.ascii = { size: img.width, data: img.data, widths: asciiWidths(img.data, img.width, img.height), origin };
    quadCache.clear();
    renderPreview();
    say('Police du client chargée (' + origin + ').', 'ok');
  }

  async function readDirEntry(entry, prefix, out) {
    if (entry.isFile) { out.push({ path: prefix + entry.name, read: () => new Promise((res, rej) => entry.file(f => f.arrayBuffer().then(b => res(new Uint8Array(b)), rej), rej)) }); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of batch) await readDirEntry(e, prefix + entry.name + '/', out); } while (batch.length);
    }
  }

  function wireFile() {
    $('ymlInput').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { loadYaml(decodeText(new Uint8Array(await f.arrayBuffer())), f.name); } catch (err) { say(err.message, 'error'); }
    });
    $('dirInput').addEventListener('change', async e => {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;
      try { await loadTree(files.map(f => ({ path: f.webkitRelativePath || f.name, read: async () => new Uint8Array(await f.arrayBuffer()) })), 'le dossier'); } catch (err) { say(err.message, 'error'); }
    });
    $('zipInput').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const idx = readZipIndex(bytes);
        await loadTree([...idx.values()].filter(x => !x.name.endsWith('/')).map(x => ({ path: x.name, read: () => extractZipEntry(bytes, x) })), f.name);
      } catch (err) { say(err.message, 'error'); }
    });
    $('jarInput').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { await loadFont(f); } catch (err) { say(err.message, 'error'); }
    });
    $('pasteBtn').addEventListener('click', async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (!t.trim()) { say('Presse-papiers vide.', 'error'); return; }
        loadYaml(t, 'items.yml (collé)');
      } catch (err) {
        $('rawDetails').open = true;
        $('rawText').focus();
        say('Le navigateur refuse la lecture du presse-papiers : collez dans le texte brut (Ctrl+V).', 'error');
      }
    });
    $('rawText').addEventListener('input', debounce(() => { S.rewrite = null; applyText($('rawText').value, { fromRaw: true, selectIndex: S.sel }); }, 250));
    $('downloadBtn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([S.text], { type: 'text/yaml;charset=utf-8' }));
      a.download = 'items.yml';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('copyFileBtn').addEventListener('click', () => copy(S.text, 'Fichier copié.'));
    $('copyEntryBtn').addEventListener('click', () => copy($('entryYaml').textContent, 'YAML de l\'item copié.'));
    $('exampleBtn').addEventListener('click', () => loadYaml($('example-yaml').textContent.replace(/^\n/, ''), 'items.yml (exemple)'));
    $('newFileBtn').addEventListener('click', () => { loadYaml('# BeltariaContent : items personnalises, a donner avec /content give.\n', 'items.yml'); $('newId').focus(); });
    $('search').addEventListener('input', e => { S.filter = e.target.value; renderList(); });
    $('statusFilter').addEventListener('change', e => { S.status = e.target.value; renderList(); });
    $('itemList').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) select(Number(b.dataset.i)); });
    $('addBtn').addEventListener('click', () => { addItem($('newId').value.trim()); $('newId').value = ''; });
    $('newId').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('addBtn').click(); } });
    $('packList').addEventListener('click', e => { const b = e.target.closest('[data-pack]'); if (b) addItem(b.dataset.pack, true); });
    $('dupBtn').addEventListener('click', () => {
      flushPending();
      const r = current();
      if (!r) return;
      let n = 2, id = r.id + '_' + n;
      while (S.res.entries.some(x => x.id === id)) id = r.id + '_' + (++n);
      applyText(L.duplicateEntry(S.text, target(), id), { selectId: id });
      say('« ' + r.id + ' » dupliqué en « ' + id + ' » (commentaires compris).', 'ok');
    });
    $('delBtn').addEventListener('click', () => {
      const r = current();
      if (!r) return;
      if (!S.delArmed) {
        S.delArmed = true;
        $('delBtn').textContent = 'Confirmer la suppression';
        setTimeout(() => { S.delArmed = false; $('delBtn').textContent = 'Supprimer'; }, 4000);
        return;
      }
      S.delArmed = false;
      $('delBtn').textContent = 'Supprimer';
      flushPending();
      applyText(L.deleteEntry(S.text, target()), { selectIndex: Math.max(0, S.sel - 1) });
      say('« ' + r.id + ' » supprimé (les commentaires au-dessus de l\'entrée sont gardés).', 'ok');
    });
    $('langSel').addEventListener('change', e => { S.lang = e.target.value; renderPreview(); });
    $('scaleSel').addEventListener('change', e => { S.scale = Number(e.target.value); renderPreview(); });
    // Glisser-déposer : un items.yml, un zip, un dossier.
    document.addEventListener('dragover', e => { e.preventDefault(); });
    document.addEventListener('drop', async e => {
      e.preventDefault();
      const items = [...(e.dataTransfer.items || [])];
      const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
      try {
        if (entries.some(en => en.isDirectory)) { const out = []; for (const en of entries) await readDirEntry(en, '', out); await loadTree(out, 'le dossier déposé'); return; }
        const f = e.dataTransfer.files[0];
        if (!f) return;
        if (/\.zip$/i.test(f.name)) { const bytes = new Uint8Array(await f.arrayBuffer()); const idx = readZipIndex(bytes); await loadTree([...idx.values()].filter(x => !x.name.endsWith('/')).map(x => ({ path: x.name, read: () => extractZipEntry(bytes, x) })), f.name); }
        else if (/\.jar$/i.test(f.name) || /ascii\.png$/i.test(f.name)) await loadFont(f);
        else loadYaml(decodeText(new Uint8Array(await f.arrayBuffer())), f.name);
      } catch (err) { say(err.message, 'error'); }
    });
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); say(done, 'ok'); }
    catch (e) { say('Copie refusée par le navigateur : sélectionnez le texte à la main.', 'error'); }
  }

  /* ---------- initialisation ---------- */
  function init() {
    $('materials').innerHTML = L.MATERIALS.filter(m => m.id !== 0).map(m => {
      const it = L.MC.items[m.id];
      return '<option value="' + m.name + '">' + esc(m.name + ' — ' + (it ? it.n['0'][1] : 'bloc sans item') + ' (' + m.id + ', pile ' + m.stack + ')') + '</option>';
    }).join('');
    $('enchSelect').innerHTML = enchOptions('DAMAGE_ALL');
    const FLAG_FR = { HIDE_ENCHANTS: 'les enchantements', HIDE_ATTRIBUTES: 'les attributs (dégâts)', HIDE_UNBREAKABLE: '« Incassable »', HIDE_DESTROYS: '« Peut casser » (sans effet ici)', HIDE_PLACED_ON: '« Se pose sur » (sans effet ici)', HIDE_POTION_EFFECTS: 'les infos de l\'item (potions, disques…)' };
    $('flagBoxes').innerHTML = L.FLAGS.map(f => '<label class="st-toggle"><input type="checkbox" value="' + f + '"><span><span class="ie-mono">' + f + '</span><small>masque ' + esc(FLAG_FR[f]) + '</small></span></label>').join('');
    $('fAnchor').innerHTML = L.ANCHORS.map(a => '<option value="' + a.name + '">' + a.name + '</option>').join('');
    wireForm();
    wireFile();
    loadYaml($('example-yaml').textContent.replace(/^\n/, ''), 'items.yml (exemple)');
    const sword = S.res.entries.findIndex(r => r.id === 'beltarium_sword');
    if (sword >= 0) select(sword);
    say('Exemple chargé : ouvrez votre items.yml, ou le dossier plugins/BeltariaContent pour lister aussi le pack.');
  }

  window.ItemsEditor = {
    state: S,
    load: (text, name) => loadYaml(text, name || 'items.yml'),
    text: () => S.text,
    select: id => { const i = S.res.entries.findIndex(r => r.id === id && !r.shadowed); if (i >= 0) select(i); return i; },
    current,
    loadTree,
    uiStringWidth
  };
  init();
})();
