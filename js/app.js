/* app.js – Skadesmelding, bid 1 (testversion, kun lokal lagring).
 * UI og flow følger mockuppen. Al lagring går gennem Store (store.js), al afsendelse gennem Sync (sync.js).
 */
(function () {
  'use strict';
  const APP_VERSION = '1.0.1-test';
  const app = document.getElementById('app');

  // ---------- Hjælpere ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const hhmm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const nowIso = () => new Date().toISOString();
  const tm = iso => { if (!iso) return ''; const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dt = iso => { if (!iso) return ''; const d = new Date(iso); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + tm(iso); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const blankCur = () => ({ partId: '', view: 'front', part: '', kind: '', desc: '', cause: '', loc: '', room: '', locOther: '' });
  const blankP = () => ({ jnr: '', start: '', end: '', type: '', role: '', out: false, reqTimes: { 'Vagtlæge': '', 'Ambulance': '' }, contact: false, triage: '', urgency: '', injuries: [], cur: blankCur(), treatment: '', assist: [], assistOther: '', mats: { 'Plaster': 0, 'Forbinding': 0, 'Støtteforbinding': 0, 'Ispose': 0, 'Andet': 0 }, matOther: '' });
  const defaultSettings = () => ({ deviceName: '', prefix: 'hh' + String(new Date().getFullYear()).slice(-2), rangeStart: 1, rangeEnd: 199, next: 1, pin: '' });
  const STATUS_TEXT = { lokal: 'Gemt lokalt', 'i kø': 'I kø', sendt: 'Sendt' };

  // ---------- Tilstand ----------
  const S = {
    screen: 'boot', settings: null, users: [], shifts: [], treatments: [], drafts: {},
    showNew: false, newName: '', activeId: null, p: blankP(), adding: false, err: '',
    bodyView: 'front', bodyOpen: true, showEntries: false, entriesFrom: null, editMode: null, histId: null, draftBackup: null,
    toast: '', confirmId: null, confirmWipe: false, confirmDiscard: false, sendConfirm: false, contactChk: false,
    pin: '', unlocked: false, viewId: null, form: {}
  };

  const ORDER = ['patient', 'triage', 'body', 'describe', 'location', 'treatment', 'assist', 'materials'];
  const BACK = { hub: 'home', patient: 'hub', triage: 'patient', body: 'triage', describe: 'body', location: 'describe', treatment: 'location', assist: 'treatment', materials: 'assist', history: 'hub', detail: 'history', pin: 'home', dash: 'home', settings: 'dash' };
  const TITLES = { setup: 'Opsætning', home: 'Skadesmelding', patient: 'Patient', triage: 'Triage', body: 'Skade', describe: 'Skade', location: 'Sted', treatment: 'Behandling', assist: 'Assistance', materials: 'Materialer', history: 'Mine behandlinger', detail: 'Behandling', pin: 'Dashboard', dash: 'Dashboard', settings: 'Indstillinger' };
  const TRI = { 'Rød': '#E5534B', 'Gul': '#E8C547', 'Grøn': '#4CB86A' };
  const ZONES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Andet'];
  const KINDS = ['Sår', 'Brud', 'Forstuvning', 'Fremmedlegeme', 'Mentalt', 'Andet'];

  // ---------- Kropsfigur ----------
  const SN = { overarm: 'overarm', underarm: 'underarm', haand: 'hånd', fingre: 'fingre', laar: 'lår', knae: 'knæ', underben: 'underben', fod: 'fod', taer: 'tæer' };
  const CN = { front: { head: 'Hoved', torso: 'Torso', abdomen: 'Mave', groin: 'Skridt' }, back: { head: 'Baghoved', torso: 'Ryg', abdomen: 'Lænd', groin: 'Sæde' } };
  const GEO = {
    head: ['e', 100, 31, 21, 25], torso: ['r', 68, 66, 64, 66, 14], abdomen: ['r', 70, 134, 60, 44, 10], groin: ['r', 74, 180, 52, 30, 10],
    L_overarm: ['r', 44, 68, 22, 64, 10], L_underarm: ['r', 38, 134, 22, 58, 10], L_haand: ['r', 34, 194, 24, 22, 8], L_fingre: ['r', 35, 218, 22, 16, 6],
    R_overarm: ['r', 134, 68, 22, 64, 10], R_underarm: ['r', 140, 134, 22, 58, 10], R_haand: ['r', 142, 194, 24, 22, 8], R_fingre: ['r', 143, 218, 22, 16, 6],
    L_laar: ['r', 74, 212, 25, 70, 10], L_knae: ['r', 75, 284, 23, 20, 8], L_underben: ['r', 76, 306, 21, 66, 9], L_fod: ['r', 72, 374, 27, 20, 7], L_taer: ['r', 70, 396, 29, 13, 5],
    R_laar: ['r', 101, 212, 25, 70, 10], R_knae: ['r', 102, 284, 23, 20, 8], R_underben: ['r', 103, 306, 21, 66, 9], R_fod: ['r', 101, 374, 27, 20, 7], R_taer: ['r', 101, 396, 29, 13, 5]
  };
  const label = (id, view) => {
    if (CN[view][id]) return CN[view][id];
    const [s, k] = id.split('_');
    const right = (view === 'front') === (s === 'L');
    return (right ? 'Højre ' : 'Venstre ') + SN[k];
  };

  // ---------- Afledte værdier ----------
  const locText = i => !i.loc ? '' : (i.loc === 'Andet' ? (i.locOther || 'Andet') : i.loc + (i.room ? ', rum ' + i.room : ''));
  const matText = p => Object.keys(p.mats).filter(k => p.mats[k] > 0).map(k => (k === 'Andet' && p.matOther ? p.matOther : k) + ' ×' + p.mats[k]).join(', ');
  const assistText = p => p.assist.map(a => a === 'Andet' && p.assistOther ? 'Andet: ' + p.assistOther : (p.reqTimes && p.reqTimes[a] ? a + ' (rekv. ' + p.reqTimes[a] + ')' : a)).join(', ');
  const typeText = p => p.type === 'Frivillig' ? 'Frivillig' + (p.role ? ' (' + p.role + ')' : '') + (p.out ? ' · Udgår' : '') : (p.type || '–');
  const timeText = t => tm(t.start) + (t.end ? '–' + tm(t.end) : '');
  const user = () => S.users.find(u => u.id === S.activeId) || { name: '' };
  const openShift = uid => S.shifts.find(s => s.userId === uid && !s.end);
  const fmtJnr = n => S.settings.prefix + '-' + String(n).padStart(3, '0');
  const left = () => S.settings.rangeEnd - S.settings.next + 1;

  // ---------- Persistens ----------
  const saveErr = e => flash('Kunne ikke gemme på enheden: ' + (e && e.message ? e.message : e));
  const saveSettings = () => Store.setMeta('settings', S.settings).catch(saveErr);
  let draftT;
  function saveDraft() {
    if (!S.activeId || S.histId) return;
    if (S.p.jnr) S.drafts[S.activeId] = S.p; else delete S.drafts[S.activeId];
    clearTimeout(draftT);
    draftT = setTimeout(() => Store.setMeta('drafts', S.drafts).catch(saveErr), 150);
  }
  function takeJnr() {
    const s = S.settings;
    if (s.next > s.rangeEnd) return null;
    const j = fmtJnr(s.next); s.next += 1; saveSettings();
    return j;
  }

  // ---------- Render-hjælpere ----------
  let toastT, advT, ENTRIES = [];
  function set(patch) { Object.assign(S, patch); render(); }
  function go(screen) { set({ screen, showEntries: false, err: '' }); }
  function flash(msg) { set({ toast: msg }); clearTimeout(toastT); toastT = setTimeout(() => set({ toast: '' }), 3200); }
  function fail(msg) { set({ err: msg }); }
  function adv(screen) { if (S.editMode) return; clearTimeout(advT); advT = setTimeout(() => go(screen), 300); }

  function buildEntries() {
    const p = S.p, cur = p.cur, list = [];
    const page = scr => () => startEdit(scr, null);
    list.push({ k: 'Patient', v: p.jnr + ' · ' + typeText(p), go: page('patient') });
    list.push({ k: 'Triage · melding', v: [p.triage, p.urgency].filter(Boolean).join(' · ') || '–', go: page('triage') });
    p.injuries.forEach((inj, i) => {
      const n = 'Skade ' + (i + 1);
      list.push({ k: n + ' · legemsdel og type', v: inj.part + ' · ' + inj.kind, go: () => startEdit('body', i) });
      list.push({ k: n + ' · beskrivelse og årsag', v: (inj.desc || '–') + (inj.cause ? ' / ' + inj.cause : ''), go: () => startEdit('describe', i) });
      list.push({ k: n + ' · sted', v: locText(inj) || '–', go: () => startEdit('location', i) });
    });
    if (cur.partId && !S.histId) list.push({ k: 'Skade (i gang)', v: cur.part + (cur.kind ? ' · ' + cur.kind : ''), go: () => go('body') });
    list.push({ k: 'Udført behandling', v: p.treatment || '–', go: page('treatment') });
    list.push({ k: 'Assistance', v: assistText(p) || '–', go: page('assist') });
    list.push({ k: 'Materialer', v: matText(p) || '–', go: page('materials') });
    return list;
  }
  function startEdit(screen, idx) {
    const em = { ret: S.entriesFrom || S.screen, snap: JSON.stringify(S.p), idx };
    if (idx !== null) { const inj = S.p.injuries[idx]; S.p.cur = clone(inj); S.bodyView = inj.view; }
    set({ editMode: em, bodyOpen: false, screen, showEntries: false, err: '' });
  }

  // ---------- Ikoner og felter ----------
  const chevL = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const chevR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A3A8B3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const pen = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A3A8B3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>';
  const seg = (on, a, arg, text) => `<button class="seg ${on ? 'on' : ''}" aria-pressed="${on}" data-a="${a}" data-arg="${esc(arg)}">${esc(text)}</button>`;
  const field = (id, lbl, f, val, ph, extra = '') => `<div><label class="lbl" for="${id}">${lbl}</label><input id="${id}" class="field" type="text" data-f="${f}" value="${esc(val)}" placeholder="${esc(ph)}" ${extra}></div>`;
  const area = (id, lbl, f, val, ph, style = '') => `<div><label class="lbl" for="${id}">${lbl}</label><textarea id="${id}" class="field" data-f="${f}" placeholder="${esc(ph)}" style="${style}">${esc(val)}</textarea></div>`;
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // ---------- Skærme ----------
  const V = {
    boot() { return '<div class="boot">Indlæser…</div>'; },

    setup() {
      const f = S.form;
      return `<div class="col">
        <div style="display:flex;flex-direction:column;gap:6px"><h1 style="margin:0;font-size:24px">Opsæt denne enhed</h1>
        <p class="hint">Gøres én gang pr. telefon. Kan ændres senere under Dashboard → Indstillinger.</p></div>
        ${field('f-dev', 'Enhedens navn', 'form.deviceName', f.deviceName, 'Fx Telefon 1')}
        <div><span class="lbl">Nummerserie for journalnumre</span>
          <div class="two"><input class="field" type="text" inputmode="numeric" data-f="form.rangeStart" value="${esc(f.rangeStart)}" aria-label="Fra nummer" placeholder="Fra">
          <input class="field" type="text" inputmode="numeric" data-f="form.rangeEnd" value="${esc(f.rangeEnd)}" aria-label="Til nummer" placeholder="Til"></div>
          <p class="hint" style="margin-top:8px">Hver telefon skal have sin egen serie, fx Telefon 1: 1–199, Telefon 2: 200–399.</p></div>
        ${field('f-pre', 'Sæsonprefix', 'form.prefix', f.prefix, 'hh26')}
        <div><label class="lbl" for="f-pin">PIN-kode til dashboard (4–6 cifre)</label><input id="f-pin" class="field" type="password" inputmode="numeric" maxlength="6" data-f="form.pin" value="${esc(f.pin)}" placeholder="••••" style="font-size:22px;letter-spacing:6px"></div>
        ${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
        <button class="btn btn-primary" data-a="saveSetup">Gem og start</button></div>`;
    },

    home() {
      return `<div class="col">
        <div style="display:flex;flex-direction:column;gap:6px"><h1 style="margin:0;font-size:26px">Hvem er på vagt?</h1><p class="hint">Start din vagt, og tryk så på dit navn for at registrere behandlinger.</p></div>
        ${S.users.map(u => {
          const sh = openShift(u.id), dr = S.drafts[u.id];
          return `<div class="card" style="display:flex;flex-direction:column;gap:12px">
          <button class="profile" data-a="openUser" data-arg="${u.id}"><span class="avatar">${esc(u.name.charAt(0).toUpperCase())}</span>
            <span style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0"><span style="font-size:19px;font-weight:700">${esc(u.name)}</span>
            <span style="font-size:14px;color:${sh ? '#6FD08C' : '#A3A8B3'}">${sh ? 'På vagt siden ' + tm(sh.start) : 'Ikke på vagt'}${dr ? ' · behandling i gang' : ''}</span></span>${chevR}</button>
          <button class="btn ${sh ? 'btn-danger' : 'btn-primary'}" data-a="toggleShift" data-arg="${u.id}">${sh ? 'Afslut vagt' : 'Start vagt'}</button>
        </div>`;
        }).join('')}
        ${S.showNew ? `<div class="card" style="display:flex;flex-direction:column;gap:12px">
          <label class="lbl" for="newname" style="margin:0">Navn på ny førstehjælper</label>
          <input id="newname" class="field" type="text" data-f="newName" value="${esc(S.newName)}" placeholder="Fornavn" autocomplete="off">
          <div class="segs"><button class="btn btn-ghost" data-a="cancelNew">Annullér</button><button class="btn btn-primary" data-a="createUser">Opret</button></div></div>`
          : `<button class="btn" data-a="openNew">+ Ny førstehjælper</button>`}
        <div style="height:4px"></div>
        <button class="btn btn-ghost" data-a="openPin">Dashboard (kræver PIN)</button>
        <div style="display:flex;align-items:center;justify-content:center;gap:24px;padding:24px 0 8px;border-top:1px solid #23262D;margin-top:8px">
          <img src="icons/logo.png" alt="Dystopia Entertainment – førstehjælp" style="width:140px;height:140px;border-radius:16px">
        </div>
        ${isStandalone() ? '' : '<p class="hint" style="text-align:center">Tip: Installér appen på hjemmeskærmen – iPhone: Del → Føj til hjemmeskærm. Android: ⋮ → Installér app.</p>'}
        <p class="hint" style="text-align:center;font-size:12px">${esc(S.settings.deviceName)} · journalnr. ${esc(fmtJnr(S.settings.rangeStart))}–${esc(fmtJnr(S.settings.rangeEnd))} · v${APP_VERSION}</p></div>`;
    },

    hub() {
      const sh = openShift(S.activeId);
      const mine = sh ? S.treatments.filter(t => t.shiftId === sh.id).length : 0;
      const draft = S.p.jnr;
      return `<div class="col">
        <div class="card" style="display:flex;flex-direction:column;gap:4px"><span style="font-size:14px;color:#A3A8B3">På vagt siden ${esc(sh ? tm(sh.start) : '–')}</span><span style="font-size:17px;font-weight:700">${mine} ${mine === 1 ? 'behandling' : 'behandlinger'} på denne vagt</span></div>
        ${draft
          ? `<button class="btn btn-primary big" data-a="resume">Fortsæt behandling ${esc(draft)}</button>
             <button class="linkbtn" style="align-self:center" data-a="askDiscard">Kassér igangværende behandling</button>`
          : `<button class="btn btn-primary big" data-a="startTreatment">Start ny behandling</button>`}
        <button class="btn big" data-a="go" data-arg="history">Se dine behandlinger</button>
        ${left() <= 10 ? `<p class="hint" style="color:#FFC56B">${left() <= 0 ? 'Nummerserien er brugt op.' : 'Kun ' + left() + ' journalnumre tilbage i serien.'} Ret serien under Dashboard → Indstillinger.</p>` : ''}</div>`;
    },

    patient() {
      const p = S.p;
      return `<div class="col" style="gap:22px">
        <div class="card" style="display:flex;flex-direction:column;gap:2px"><span class="k">Journalnummer</span><span class="jnr">${esc(p.jnr)}</span><span class="hint">Tildeles automatisk</span></div>
        <div><span class="lbl">Patienten er</span><div class="segs" role="group" aria-label="Patienttype">${seg(p.type === 'Gæst', 'pickType', 'Gæst', 'Gæst')}${seg(p.type === 'Frivillig', 'pickType', 'Frivillig', 'Frivillig')}</div></div>
        ${p.type === 'Frivillig' ? field('prole', 'Hvilken rolle/funktion?', 'p.role', p.role, 'Fx skuespiller i Charlie') + `<label class="chk"><input type="checkbox" data-f="p.out" ${p.out ? 'checked' : ''}>Udgår</label>` : ''}</div>`;
    },

    triage() {
      const p = S.p;
      return `<div class="col" style="gap:26px">
        <div><span class="lbl">Triage</span><div class="segs" role="group" aria-label="Triage">
          ${[['Grøn', 'tri-g'], ['Gul', 'tri-y'], ['Rød', 'tri-r']].map(([n, c]) => `<button class="tri ${c} ${p.triage === n ? 'on' : ''}" aria-pressed="${p.triage === n}" data-a="tri" data-arg="${n}">${n}</button>`).join('')}</div></div>
        <div><span class="lbl">Melding</span><div class="segs" role="group" aria-label="Melding">
          ${['Normal', 'Haste', 'Akut'].map(n => seg(p.urgency === n, 'urg', n, n)).join('')}</div></div></div>`;
    },

    body() {
      const p = S.p, cur = p.cur, view = S.bodyView;
      const showFig = !cur.partId || S.bodyOpen;
      const shapes = Object.keys(GEO).map(id => {
        const g = GEO[id];
        const sel = cur.partId === id && cur.view === view;
        const hurt = p.injuries.some(i => i.partId === id && i.view === view);
        const fill = sel ? '#F2A93B' : hurt ? '#E5534B' : '#4A505B';
        const t = `<title>${esc(label(id, view))}</title>`;
        return g[0] === 'e'
          ? `<ellipse class="bp" data-a="part" data-arg="${id}" cx="${g[1]}" cy="${g[2]}" rx="${g[3]}" ry="${g[4]}" fill="${fill}">${t}</ellipse>`
          : `<rect class="bp" data-a="part" data-arg="${id}" x="${g[1]}" y="${g[2]}" width="${g[3]}" height="${g[4]}" rx="${g[5]}" fill="${fill}">${t}</rect>`;
      }).join('');
      const fig = `<div class="segs" role="group" aria-label="Side af kroppen">${seg(view === 'front', 'view', 'front', 'Forside')}${seg(view === 'back', 'view', 'back', 'Bagside')}</div>
        <div style="display:flex;justify-content:center;padding:4px 0">
          <svg width="200" height="410" viewBox="0 0 200 412" role="img" aria-label="Kropsfigur – tryk på en legemsdel">${shapes}<rect x="92" y="55" width="16" height="10" fill="#3A3F48"/></svg></div>
        <p class="hint" style="text-align:center">Orange = valgt · Rød = allerede registreret på denne patient</p>`;
      const chosen = `<div class="card" style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0"><div class="k">Valgt legemsdel</div><div style="font-size:20px;font-weight:700">${esc(cur.part)}</div><div style="font-size:13px;color:#A3A8B3">${cur.view === 'front' ? 'Forside' : 'Bagside'}</div></div>
        <button class="btn" style="width:auto" data-a="openFigure">Skift</button></div>`;
      return `<div class="col" style="gap:16px">${showFig ? fig : chosen}
        ${cur.partId ? `<div><label class="lbl" for="kind">Skadetype</label><select id="kind" class="field" data-f="cur.kind" data-change="kind">
          <option value="">Vælg skadetype…</option>${KINDS.map(k => `<option ${cur.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>` : ''}</div>`;
    },

    describe() {
      const c = S.p.cur;
      return `<div class="col" style="gap:22px"><p class="hint">${esc(c.part)} · ${esc(c.kind)}</p>
        ${area('desc', 'Beskrivelse af skaden', 'cur.desc', c.desc, 'Beskriv skaden så godt som muligt, i så mange detaljer som muligt')}
        ${area('cause', 'Årsag til skade', 'cur.cause', c.cause, 'Beskriv årsag til skaden i så mange detaljer som muligt')}</div>`;
    },

    location() {
      const c = S.p.cur;
      return `<div class="col" style="gap:22px">
        <div><label class="lbl" for="loc">Hvor skete skaden?</label><select id="loc" class="field" data-f="cur.loc" data-change="loc">
          <option value="">Vælg område…</option>${ZONES.map(z => `<option ${c.loc === z ? 'selected' : ''}>${z}</option>`).join('')}</select></div>
        ${c.loc && c.loc !== 'Andet' ? field('room', 'Skriv rumnummer', 'cur.room', c.room, 'Fx 3', 'inputmode="numeric"') : ''}
        ${c.loc === 'Andet' ? field('locother', 'Hvor præcist?', 'cur.locOther', c.locOther, 'Fx køen ved indgangen') : ''}</div>`;
    },

    treatment() {
      return `<div class="col">${area('treat', 'Udført behandling', 'p.treatment', S.p.treatment, 'Beskriv den udførte behandling så godt som muligt. Skriv "Ingen" hvis du ikke har lavet en behandling', 'min-height:220px')}</div>`;
    },

    assist() {
      const p = S.p;
      return `<div class="col" style="gap:22px"><div><span class="lbl">Assistancebehov</span><p class="hint" style="margin-bottom:10px">Vælg alle der passer – eller Ingen.</p>
        <div class="grid2">${['Vagtlæge', 'Ambulance', 'SL/NK', 'Andet'].map(n => seg(p.assist.includes(n), 'assist', n, n)).join('')}
        <div style="grid-column:span 2">${seg(p.assist.includes('Ingen'), 'assist', 'Ingen', 'Ingen').replace('class="seg', 'class="seg full')}</div></div></div>
        ${['Vagtlæge', 'Ambulance'].filter(n => p.assist.includes(n)).map(n => `<div><label class="lbl" for="rt-${n}">${n} – rekvireret klokken</label><div class="timerow"><input id="rt-${n}" class="field" type="time" data-f="rt.${n}" value="${esc(p.reqTimes[n])}" style="font-size:20px"><button class="clockbtn" aria-label="Vælg tidspunkt for ${n}" data-a="pickTime" data-arg="rt-${n}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button></div></div>`).join('')}
        ${p.assist.includes('Andet') ? field('aother', 'Andet', 'p.assistOther', p.assistOther, 'Beskriv andet') : ''}</div>`;
    },

    materials() {
      const p = S.p, n = p.injuries.length;
      return `<div class="col" style="gap:14px"><span class="lbl" style="margin:0">Materialeforbrug</span>
        ${Object.keys(p.mats).map(m => `<div class="mat">${seg(p.mats[m] > 0, 'matToggle', m, m)}
          <button class="step" aria-label="Færre ${m}" data-a="matDec" data-arg="${m}">−</button><span class="count" aria-live="polite">${p.mats[m]}</span>
          <button class="step" aria-label="Flere ${m}" data-a="matInc" data-arg="${m}">+</button></div>`).join('')}
        ${p.mats['Andet'] > 0 ? field('mother', 'Andet materiale', 'p.matOther', p.matOther, 'Hvilket materiale?') : ''}
        <p class="hint">${n === 1 ? '1 skade registreret' : n + ' skader registreret'} på denne patient.</p></div>`;
    },

    history() {
      const sh = openShift(S.activeId);
      const mine = sh ? S.treatments.filter(t => t.shiftId === sh.id).sort((a, b) => b.start.localeCompare(a.start)) : [];
      if (!mine.length) return '<p class="hint">Ingen behandlinger på denne vagt endnu.</p>';
      return `<div class="col" style="gap:10px">${mine.map(t => `<button class="row" data-a="openT" data-arg="${t.id}">
        <span style="display:flex;align-items:center;gap:12px;min-width:0"><span style="width:14px;height:14px;border-radius:50%;background:${TRI[t.triage] || '#4A505B'};flex:none" aria-hidden="true"></span>
        <span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:17px;font-weight:700">${esc(t.jnr)}</span><span style="font-size:14px;color:#A3A8B3">${timeText(t)} · ${esc(t.injuries.map(i => i.part + ' – ' + i.kind).join(', '))}</span></span></span>
        <span style="font-size:13px;font-weight:700;color:${t.status === 'sendt' ? '#6FD08C' : '#9DB8DE'};flex:none">${STATUS_TEXT[t.status] || t.status}</span></button>`).join('')}</div>`;
    },

    detail() {
      const t = S.treatments.find(x => x.id === S.viewId); if (!t) return '';
      const rows = [
        ['Tidspunkt', 'Start ' + tm(t.start) + ' · Slut ' + (tm(t.end) || '–') + ' · ' + (STATUS_TEXT[t.status] || t.status) + (t.version > 1 ? ' · rettet ' + dt(t.updatedAt) : '')],
        ['Patient', t.jnr + ' · ' + typeText(t)],
        ['Triage · melding', t.triage + ' · ' + t.urgency],
        ['Skader', t.injuries.map(i => i.part + ' – ' + i.kind + '\n' + (i.desc || '–') + '\nÅrsag: ' + (i.cause || '–') + '\nSted: ' + locText(i)).join('\n\n')],
        ['Udført behandling', t.treatment || '–'], ['Assistance', assistText(t) || 'Ingen'], ['Materialer', matText(t) || 'Ingen'], ['Navn og telefonnummer indsamlet', t.contact ? 'Ja' : 'Nej']
      ];
      return `<div class="col" style="gap:14px"><div class="card col" style="gap:14px">${rows.map(([k, v]) => `<div style="display:flex;flex-direction:column;gap:2px"><span class="k">${k}</span><span style="font-size:16px;white-space:pre-line">${esc(v)}</span></div>`).join('')}</div>
        <button class="btn" data-a="editDetail">Rediger behandling</button></div>`;
    },

    pin() {
      return `<div class="col" style="gap:16px"><p class="hint">Dashboardet viser kun anonymiserede tal. Indtast holdets PIN-kode.</p>
        <div><label class="lbl" for="pin">PIN-kode</label><input id="pin" class="field" type="password" inputmode="numeric" maxlength="6" data-f="pin" value="${esc(S.pin)}" placeholder="••••" style="font-size:24px;letter-spacing:8px"></div>
        <button class="btn btn-primary" data-a="unlock">Lås op</button></div>`;
    },

    dash() {
      const a = S.treatments, c = f => a.filter(f).length;
      const tile = (n, k, color = '') => `<div class="tile"><span class="n" style="${color ? 'color:' + color : ''}">${n}</span><span class="k">${k}</span></div>`;
      const kinds = KINDS.map(k => [k, a.reduce((s, t) => s + t.injuries.filter(i => i.kind === k).length, 0)]).filter(x => x[1] > 0);
      return `<div class="col" style="gap:14px"><p class="hint">Anonymiseret · alle førstehjælpere · ${esc(S.settings.deviceName)}</p>
        <div class="grid2"><div class="tile" style="grid-column:span 2"><span class="n">${a.length}</span><span class="k">Behandlinger i alt</span></div>
        ${tile(c(t => t.triage === 'Rød'), 'Triage rød', '#FF8A82')}${tile(c(t => t.triage === 'Gul'), 'Triage gul', '#E8C547')}
        ${tile(c(t => t.triage === 'Grøn'), 'Triage grøn', '#6FD08C')}${tile(c(t => t.urgency === 'Akut'), 'Akut')}
        ${tile(c(t => t.urgency === 'Haste'), 'Haste')}${tile(c(t => t.urgency === 'Normal'), 'Normal')}</div>
        ${kinds.length ? `<div class="card col" style="gap:8px"><span class="k">Skadetyper</span>${kinds.map(([k, n]) => `<div style="display:flex;justify-content:space-between"><span>${esc(k)}</span><b>${n}</b></div>`).join('')}</div>` : ''}
        <button class="btn btn-primary" data-a="export">Eksportér til Excel (.xlsx)</button>
        <p class="hint">Eksporten indeholder alle behandlinger, skader og vagter på denne enhed. Filen gemmes lokalt i Overførsler/Filer.</p>
        <button class="btn" data-a="openSettings">Indstillinger</button>
        <button class="btn btn-danger" data-a="askWipe">Slet alle testdata</button></div>`;
    },

    settings() {
      const f = S.form;
      return `<div class="col">
        ${field('s-dev', 'Enhedens navn', 'form.deviceName', f.deviceName, 'Fx Telefon 1')}
        <div><span class="lbl">Nummerserie for journalnumre</span>
          <div class="two"><input class="field" type="text" inputmode="numeric" data-f="form.rangeStart" value="${esc(f.rangeStart)}" aria-label="Fra nummer">
          <input class="field" type="text" inputmode="numeric" data-f="form.rangeEnd" value="${esc(f.rangeEnd)}" aria-label="Til nummer"></div>
          <p class="hint" style="margin-top:8px">Næste nummer: <b>${esc(fmtJnr(S.settings.next))}</b> · ${Math.max(0, left())} tilbage</p></div>
        ${field('s-pre', 'Sæsonprefix', 'form.prefix', f.prefix, 'hh26')}
        <div><label class="lbl" for="s-pin">Ny PIN-kode (tom = uændret)</label><input id="s-pin" class="field" type="password" inputmode="numeric" maxlength="6" data-f="form.pin" value="${esc(f.pin)}" placeholder="••••" style="font-size:22px;letter-spacing:6px"></div>
        ${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
        <button class="btn btn-primary" data-a="saveSettings">Gem indstillinger</button>
        <p class="hint">Ændres prefix eller serie, starter numrene fra seriens første nummer.</p></div>`;
    }
  };

  function render() {
    if (!S.settings && S.screen !== 'boot') return;
    const main = app.querySelector('main');
    const keepScroll = main && main.dataset.screen === S.screen ? main.scrollTop : 0;
    const focusedId = document.activeElement && document.activeElement.id;
    const isFlow = ORDER.includes(S.screen), stepNo = ORDER.indexOf(S.screen) + 1, u = user();
    const title = (S.screen === 'hub' ? u.name : TITLES[S.screen] || '') + (S.editMode ? ' – rediger' : '');
    const sub = S.editMode ? 'Ret og tryk Gem' : isFlow ? u.name : ['home', 'hub', 'setup'].includes(S.screen) ? 'Dystopia Haunted House' : (['pin', 'dash', 'settings'].includes(S.screen) ? '' : u.name);
    ENTRIES = S.showEntries ? buildEntries() : [];
    const back = !['home', 'setup', 'boot'].includes(S.screen);
    app.innerHTML = `
      <div class="banner">TESTVERSION – data gemmes kun på denne enhed</div>
      <header>${back ? `<button class="iconbtn" aria-label="Tilbage" data-a="back">${chevL}</button>` : ''}
        <div style="flex:1;min-width:0"><div style="font-size:19px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</div>
        <div style="font-size:13px;color:#A3A8B3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sub)}</div></div>
        <span class="chip" title="Data gemmes på enheden"><span class="dot"></span>Lokal</span></header>
      ${isFlow && !S.editMode ? `<div style="height:4px;background:#23262D"><div style="height:4px;background:#F2A93B;width:${Math.round(stepNo / ORDER.length * 100)}%"></div></div>` : ''}
      ${isFlow && S.p.jnr ? `<div class="jbar"><span>Journalnr. <b>${esc(S.p.jnr)}</b></span><span>${S.editMode ? 'Redigering' : 'Trin ' + stepNo + ' af ' + ORDER.length}</span></div>` : ''}
      <main data-screen="${S.screen}">${V[S.screen]()}</main>
      ${isFlow ? `<footer>${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
        ${S.editMode
          ? `<div class="segs"><button class="btn btn-ghost" style="flex:1" data-a="cancelEdit">Annullér</button><button class="btn btn-primary" style="flex:1.5" data-a="saveEdit">Gem</button></div>`
          : S.screen === 'materials'
            ? `<div class="segs"><button class="btn" style="flex:1" data-a="addInjury">+ Tilføj skade</button><button class="btn btn-primary" style="flex:1.5" data-a="send">Afslut behandling og send</button></div>`
            : `<button class="btn btn-primary" data-a="next">Næste</button>`}
        ${S.editMode ? '' : '<button class="linkbtn" data-a="openEntries">Se mine indtastninger</button>'}</footer>` : ''}
      ${S.showEntries ? `<div class="overlay"><div class="sheet">
        <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:19px;font-weight:700">${S.histId ? 'Rediger behandling' : 'Mine indtastninger'}</span>
        <button class="iconbtn" aria-label="Luk" data-a="closeEntries"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <p class="hint">Tryk på et punkt for at rette det.</p>
        ${ENTRIES.map((e, i) => `<button class="row" data-a="entry" data-arg="${i}"><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="k">${esc(e.k)}</span><span style="font-size:16px">${esc(e.v)}</span></span>${pen}</button>`).join('')}
      </div></div>` : ''}
      ${S.confirmId ? dialog('Afslut vagt?', 'Sluttidspunktet logges. I testversionen bliver behandlingerne liggende på enheden, så de kan eksporteres fra Dashboard.', 'cancelEnd', 'confirmEnd', 'Afslut vagt', true) : ''}
      ${S.confirmWipe ? dialog('Slet alle testdata?', 'Alle førstehjælpere, vagter og behandlinger på denne enhed slettes, og journalnumrene starter forfra. Indstillingerne bevares. Kan ikke fortrydes.', 'cancelWipe', 'confirmWipe', 'Slet alt', true) : ''}
      ${S.confirmDiscard ? dialog('Kassér behandling?', 'Den igangværende behandling ' + esc(S.p.jnr) + ' slettes. Journalnummeret bliver ikke genbrugt.', 'cancelDiscard', 'confirmDiscard', 'Kassér', true) : ''}
      ${S.sendConfirm ? `<div class="overlay" style="justify-content:center;padding:20px"><div class="card col" style="gap:14px;background:#16181D">
        <span style="font-size:20px;font-weight:700">Afslut behandling</span>
        <label class="chk"><input type="checkbox" data-f="contactChk" ${S.contactChk ? 'checked' : ''}>Navn og telefonnummer indsamlet</label>
        <div class="info">Er der brug for at kunne kontakte patienten efterfølgende, udfyldes <b>"Kontaktformular"</b>, og denne underskrives af patienten og overleveres til SL/NK. Patienten skal have et eksemplar (ikke en kopi) af formularen.</div>
        <div class="segs"><button class="btn btn-ghost" data-a="cancelSend">Annullér</button><button class="btn btn-primary" data-a="confirmSend">Send</button></div></div></div>` : ''}
      ${S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : ''}`;
    const m = app.querySelector('main'); if (m) m.scrollTop = keepScroll;
    if (focusedId) { const el = document.getElementById(focusedId); if (el && el.tagName !== 'BUTTON') el.focus(); }
    saveDraft();
  }
  function dialog(title, text, cancelA, okA, okText, danger) {
    return `<div class="overlay" style="justify-content:center;padding:20px"><div class="card col" style="gap:14px;background:#16181D">
      <span style="font-size:20px;font-weight:700">${title}</span><p class="hint">${text}</p>
      <div class="segs"><button class="btn btn-ghost" data-a="${cancelA}">Annullér</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="${okA}">${okText}</button></div></div></div>`;
  }

  // ---------- Validering af indstillinger ----------
  function readForm(requirePin) {
    const f = S.form;
    const a = parseInt(f.rangeStart, 10), b = parseInt(f.rangeEnd, 10);
    const prefix = String(f.prefix || '').trim();
    const pin = String(f.pin || '');
    if (!String(f.deviceName || '').trim()) return { err: 'Giv enheden et navn' };
    if (!(a >= 1) || !(b >= a)) return { err: 'Nummerserien skal være fx 1–199 (til ≥ fra)' };
    if (!/^[A-Za-z0-9]{1,8}$/.test(prefix)) return { err: 'Prefix må kun indeholde bogstaver og tal, fx hh26' };
    if ((requirePin || pin) && !/^\d{4,6}$/.test(pin)) return { err: 'PIN skal være 4–6 cifre' };
    return { deviceName: f.deviceName.trim(), rangeStart: a, rangeEnd: b, prefix, pin };
  }

  // ---------- Handlinger ----------
  const A = {
    back() { if (S.editMode) return A.cancelEdit(); if (S.screen === 'dash' || S.screen === 'pin') S.unlocked = false; set({ screen: BACK[S.screen] || 'home', err: '', showEntries: false }); },
    go(s) { go(s); },
    pickTime(id) { const el = document.getElementById(id); if (!el) return; try { el.showPicker(); } catch (e) { el.focus(); } },

    saveSetup() {
      const r = readForm(true); if (r.err) return fail(r.err);
      S.settings = Object.assign(defaultSettings(), r, { next: r.rangeStart });
      saveSettings().then(() => { S.form = {}; go('home'); Store.persist(); });
    },

    openNew() { set({ showNew: true, newName: '' }); setTimeout(() => { const el = document.getElementById('newname'); if (el) el.focus(); }, 0); },
    cancelNew() { set({ showNew: false }); },
    createUser() {
      const n = S.newName.trim(); if (!n) return flash('Skriv et navn');
      if (S.users.some(u => u.name.toLowerCase() === n.toLowerCase())) return flash('Der findes allerede en førstehjælper med det navn');
      const u = { id: Store.uuid(), name: n, createdAt: nowIso() };
      Store.put('users', u).then(() => { S.users.push(u); set({ showNew: false, newName: '' }); }).catch(saveErr);
    },
    openUser(id) {
      if (!openShift(id)) return flash('Tryk "Start vagt" først');
      set({ activeId: id, p: S.drafts[id] ? S.drafts[id] : blankP(), adding: false, bodyOpen: true, bodyView: 'front', screen: 'hub' });
    },
    toggleShift(id) {
      const u = S.users.find(x => x.id === id), sh = openShift(id);
      if (!sh) {
        const s = { id: Store.uuid(), userId: id, userName: u.name, start: nowIso(), end: null };
        return Store.put('shifts', s).then(() => { S.shifts.push(s); flash('Vagt startet kl. ' + tm(s.start) + ' – logget'); }).catch(saveErr);
      }
      if (S.drafts[id]) return flash('Afslut eller kassér den igangværende behandling (' + S.drafts[id].jnr + ') først.');
      const q = Sync.pending(S.treatments.filter(t => t.userId === id));
      if (q) return flash(q + ' behandling(er) venter på at blive sendt. Find forbindelse før du afslutter.');
      set({ confirmId: id });
    },
    cancelEnd() { set({ confirmId: null }); },
    confirmEnd() {
      const sh = openShift(S.confirmId); S.confirmId = null;
      if (!sh) return render();
      sh.end = nowIso();
      Store.put('shifts', sh).then(() => {
        Object.assign(S, { activeId: null, p: blankP(), screen: 'home' });
        flash('Vagt afsluttet kl. ' + tm(sh.end) + ' – logget');
      }).catch(saveErr);
    },

    openPin() { set({ screen: 'pin', pin: '' }); setTimeout(() => { const el = document.getElementById('pin'); if (el) el.focus(); }, 0); },
    unlock() {
      if (S.pin !== S.settings.pin) { S.pin = ''; return flash('Forkert PIN-kode'); }
      set({ screen: 'dash', pin: '', unlocked: true });
    },
    export() {
      try { const r = Export.toXlsx(S.treatments, S.shifts, S.settings.deviceName); flash(r.count + ' behandling(er) eksporteret til ' + r.name); }
      catch (e) { flash('Eksport fejlede: ' + e.message); }
    },
    openSettings() {
      if (!S.unlocked) return go('pin');
      const s = S.settings;
      set({ screen: 'settings', form: { deviceName: s.deviceName, rangeStart: String(s.rangeStart), rangeEnd: String(s.rangeEnd), prefix: s.prefix, pin: '' }, err: '' });
    },
    saveSettings() {
      const r = readForm(false); if (r.err) return fail(r.err);
      const s = S.settings;
      const restart = r.prefix !== s.prefix || r.rangeStart !== s.rangeStart || r.rangeEnd !== s.rangeEnd;
      Object.assign(s, { deviceName: r.deviceName, prefix: r.prefix, rangeStart: r.rangeStart, rangeEnd: r.rangeEnd });
      if (r.pin) s.pin = r.pin;
      if (restart) s.next = r.rangeStart;
      saveSettings().then(() => { set({ form: {}, screen: 'dash', err: '' }); flash('Indstillinger gemt' + (restart ? ' – næste nummer er ' + fmtJnr(s.next) : '')); });
    },
    askWipe() { set({ confirmWipe: true }); },
    cancelWipe() { set({ confirmWipe: false }); },
    confirmWipe() {
      Store.wipeData().then(() => {
        S.settings.next = S.settings.rangeStart;
        return saveSettings();
      }).then(() => {
        Object.assign(S, { users: [], shifts: [], treatments: [], drafts: {}, activeId: null, p: blankP(), confirmWipe: false });
        flash('Alle testdata er slettet');
      }).catch(saveErr);
    },

    startTreatment() {
      const j = takeJnr();
      if (!j) return flash('Nummerserien er brugt op. Ret den under Dashboard → Indstillinger.');
      const np = blankP(); np.jnr = j; np.start = nowIso();
      set({ p: np, adding: false, bodyView: 'front', bodyOpen: true, screen: 'patient', err: '' });
    },
    resume() {
      const p = S.p;
      const s = !p.type ? 'patient' : !(p.triage && p.urgency) ? 'triage' : !p.injuries.length ? 'body' : 'materials';
      set({ screen: s, bodyOpen: !p.cur.partId, bodyView: p.cur.view || 'front' });
    },
    askDiscard() { set({ confirmDiscard: true }); },
    cancelDiscard() { set({ confirmDiscard: false }); },
    confirmDiscard() { S.p = blankP(); set({ confirmDiscard: false }); flash('Behandlingen er kasseret'); },

    pickType(v) { S.p.type = v; if (v === 'Gæst') { S.p.role = ''; S.p.out = false; } set({ err: '' }); if (v === 'Gæst') adv('triage'); },
    tri(v) { S.p.triage = v; set({ err: '' }); if (S.p.urgency) adv('body'); },
    urg(v) { S.p.urgency = v; set({ err: '' }); if (S.p.triage) adv('body'); },
    view(v) { set({ bodyView: v }); },
    part(id) { Object.assign(S.p.cur, { partId: id, view: S.bodyView, part: label(id, S.bodyView) }); set({ bodyOpen: false, err: '' }); },
    openFigure() { set({ bodyOpen: true, bodyView: S.p.cur.view || 'front' }); },
    assist(n) {
      const a = S.p.assist;
      if (n === 'Ingen') { const on = !a.includes('Ingen'); S.p.assist = on ? ['Ingen'] : []; S.p.assistOther = ''; S.p.reqTimes = { 'Vagtlæge': '', 'Ambulance': '' }; render(); if (on) adv('materials'); return; }
      const b = a.filter(x => x !== 'Ingen'), on = b.includes(n); S.p.assist = on ? b.filter(x => x !== n) : b.concat([n]);
      if (S.p.reqTimes[n] !== undefined) S.p.reqTimes[n] = on ? '' : (S.p.reqTimes[n] || hhmm());
      render();
    },
    matInc(n) { S.p.mats[n] = Math.min(99, S.p.mats[n] + 1); render(); },
    matDec(n) { S.p.mats[n] = Math.max(0, S.p.mats[n] - 1); render(); },
    matToggle(n) { S.p.mats[n] = S.p.mats[n] > 0 ? 0 : 1; render(); },
    next() {
      const p = S.p, cur = p.cur;
      switch (S.screen) {
        case 'patient': if (!p.type) return fail('Vælg Gæst eller Frivillig'); return go('triage');
        case 'triage': if (!p.triage) return fail('Vælg triage'); if (!p.urgency) return fail('Vælg melding'); return go('body');
        case 'body': if (!cur.partId) return fail('Tryk på en legemsdel'); if (!cur.kind) return fail('Vælg skadetype'); return go('describe');
        case 'describe': return go('location');
        case 'location': {
          if (!cur.loc) return fail('Vælg hvor skaden skete');
          p.injuries.push(cur); p.cur = blankCur(); S.bodyOpen = true;
          const toMat = S.adding; S.adding = false; return go(toMat ? 'materials' : 'treatment');
        }
        case 'treatment': return go('assist');
        case 'assist': return go('materials');
      }
    },
    addInjury() { set({ adding: true, bodyView: 'front', bodyOpen: true, screen: 'body', err: '' }); },
    send() {
      if (!S.p.injuries.length) return fail('Registrér mindst én skade');
      set({ sendConfirm: true, contactChk: S.p.contact, err: '' });
    },
    cancelSend() { set({ sendConfirm: false }); },
    confirmSend() {
      const p = S.p, u = user(), sh = openShift(S.activeId), now = nowIso();
      p.contact = S.contactChk; p.end = now; S.sendConfirm = false;
      const rec = Object.assign(clone(p), {
        id: Store.uuid(), userId: S.activeId, userName: u.name, shiftId: sh ? sh.id : null,
        device: S.settings.deviceName, appVersion: APP_VERSION,
        version: 1, status: Sync.statusFor(), createdAt: now, updatedAt: now
      });
      delete rec.cur;
      Store.put('treatments', rec).then(() => {
        S.treatments.push(rec); Sync.enqueue(rec);
        Object.assign(S, { p: blankP(), adding: false, screen: 'hub', showEntries: false, err: '' });
        flash('Behandling ' + rec.jnr + ' gemt på enheden');
      }).catch(saveErr);
    },
    openEntries() { set({ showEntries: true, entriesFrom: S.screen }); },
    closeEntries() {
      if (S.histId && !S.editMode) { S.p = S.draftBackup; Object.assign(S, { histId: null, draftBackup: null }); }
      set({ showEntries: false });
    },
    saveEdit() {
      const p = S.p, cur = p.cur, em = S.editMode;
      const V2 = {
        patient: () => !p.type ? 'Vælg Gæst eller Frivillig' : '',
        triage: () => !p.triage ? 'Vælg triage' : !p.urgency ? 'Vælg melding' : '',
        body: () => !cur.partId ? 'Tryk på en legemsdel' : !cur.kind ? 'Vælg skadetype' : '',
        location: () => !cur.loc ? 'Vælg hvor skaden skete' : ''
      };
      const e = V2[S.screen] ? V2[S.screen]() : ''; if (e) return fail(e);
      if (em.idx !== null) { p.injuries[em.idx] = cur; p.cur = JSON.parse(em.snap).cur; }
      S.editMode = null; S.bodyOpen = true;
      if (S.histId) {
        const old = S.treatments.find(t => t.id === S.histId);
        const body = clone(p); delete body.cur;
        const rec = Object.assign({}, old, body, {
          id: old.id, userId: old.userId, userName: old.userName, shiftId: old.shiftId, jnr: old.jnr, start: old.start, end: old.end, createdAt: old.createdAt,
          version: (old.version || 1) + 1, updatedAt: nowIso(), status: Sync.statusFor()
        });
        return Store.put('treatments', rec).then(() => {
          S.treatments = S.treatments.map(t => t.id === rec.id ? rec : t); Sync.enqueue(rec);
          S.p = S.draftBackup; Object.assign(S, { histId: null, draftBackup: null, screen: 'detail', err: '' });
          flash('Ændring gemt på enheden');
        }).catch(saveErr);
      }
      Object.assign(S, { screen: em.ret, err: '' }); flash('Ændring gemt');
    },
    cancelEdit() {
      const em = S.editMode; S.p = JSON.parse(em.snap); S.editMode = null; S.bodyOpen = true;
      if (S.histId) { S.p = S.draftBackup; Object.assign(S, { histId: null, draftBackup: null }); return set({ screen: 'detail', err: '' }); }
      set({ screen: em.ret, err: '' });
    },
    entry(i) { ENTRIES[+i].go(); },
    openT(id) { set({ viewId: id, screen: 'detail' }); },
    editDetail() {
      const t = S.treatments.find(x => x.id === S.viewId); if (!t) return;
      const copy = clone(t); copy.cur = blankCur();
      set({ draftBackup: S.p, p: copy, histId: t.id, showEntries: true, entriesFrom: 'detail' });
    }
  };

  // ---------- Events ----------
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const fn = A[el.dataset.a]; if (fn) fn(el.dataset.arg);
  });
  function setField(path, v) {
    if (path === 'newName') { S.newName = v; return; }
    if (path === 'pin') { S.pin = v.replace(/\D/g, ''); return; }
    if (path === 'contactChk') { S.contactChk = v; return; }
    const [obj, key] = path.split('.');
    if (obj === 'form') { S.form[key] = key === 'pin' ? v.replace(/\D/g, '') : v; return; }
    if (obj === 'rt') { S.p.reqTimes[key] = v; saveDraft(); return; }
    (obj === 'p' ? S.p : S.p.cur)[key] = v;
    saveDraft();
  }
  app.addEventListener('input', e => { const f = e.target.dataset && e.target.dataset.f; if (f && e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') setField(f, e.target.value); });
  app.addEventListener('change', e => {
    const t = e.target, f = t.dataset && t.dataset.f; if (!f) return;
    if (t.type === 'checkbox') { setField(f, t.checked); return; }
    if (t.tagName !== 'SELECT') return;
    setField(f, t.value);
    if (t.dataset.change === 'loc') { S.p.cur.room = ''; S.p.cur.locOther = ''; }
    S.err = ''; render();
    if (t.dataset.change === 'kind' && t.value) adv('describe');
  });
  app.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const map = { newname: 'createUser', pin: 'unlock' };
    if (map[e.target.id]) { e.preventDefault(); A[map[e.target.id]](); }
  });
  // Gem kladden, hvis appen lukkes eller skifter i baggrunden.
  const flushDraft = () => { if (S.settings) { clearTimeout(draftT); Store.setMeta('drafts', S.drafts).catch(() => {}); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
  window.addEventListener('pagehide', flushDraft);

  // ---------- Opstart ----------
  Promise.all([Store.getMeta('settings', null), Store.all('users'), Store.all('shifts'), Store.all('treatments'), Store.getMeta('drafts', {})])
    .then(([settings, users, shifts, treatments, drafts]) => {
      Object.assign(S, { users: users.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')), shifts, treatments, drafts: drafts || {} });
      if (!settings) {
        const d = S.settings = defaultSettings();
        S.form = { deviceName: '', rangeStart: String(d.rangeStart), rangeEnd: String(d.rangeEnd), prefix: d.prefix, pin: '' };
        S.screen = 'setup';
      } else {
        S.settings = Object.assign(defaultSettings(), settings);
        S.screen = 'home';
      }
      render();
    })
    .catch(err => {
      app.innerHTML = '<div class="boot">Appen kunne ikke åbne den lokale lagring.<br><br>' + esc(err && err.message) +
        '<br><br>Prøv en anden browser, eller slå privat browsing fra.</div>';
    });
})();
