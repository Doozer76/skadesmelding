/* export.js – laver en .xlsx med tre faner: Behandlinger, Skader og Vagter.
 * Kræver vendor/xlsx.mini.min.js (SheetJS). Ingen data forlader enheden – filen downloades lokalt.
 */
(function () {
  'use strict';
  const MATS = ['Plaster', 'Forbinding', 'Støtteforbinding', 'Ispose', 'Andet'];
  const pad = n => String(n).padStart(2, '0');
  const d = iso => (iso ? new Date(iso) : null);
  const date = iso => { const x = d(iso); return x ? x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) : ''; };
  const time = iso => { const x = d(iso); return x ? pad(x.getHours()) + ':' + pad(x.getMinutes()) : ''; };
  const stamp = iso => (iso ? date(iso) + ' ' + time(iso) : '');
  const yesNo = b => (b ? 'Ja' : 'Nej');
  const loc = i => (!i.loc ? '' : i.loc === 'Andet' ? (i.locOther || 'Andet') : i.loc);

  function rows(treatments, shifts, device) {
    const sorted = treatments.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const beh = sorted.map(t => {
      const r = {
        'Journalnr.': t.jnr,
        'Dato': date(t.start),
        'Start': time(t.start),
        'Slut': time(t.end),
        'Førstehjælper': t.userName || '',
        'Patienttype': t.type,
        'Rolle/funktion': t.type === 'Frivillig' ? (t.role || '') : '',
        'Udgår': t.type === 'Frivillig' ? yesNo(t.out) : '',
        'Triage': t.triage,
        'Melding': t.urgency,
        'Antal skader': t.injuries.length,
        'Skader (oversigt)': t.injuries.map(i => i.part + ' – ' + i.kind).join('; '),
        'Udført behandling': t.treatment || '',
        'Info om infektion': (t.injuries || []).some(i => i.kind === 'Sår') ? yesNo(t.infection) : '',
        'Assistance': (t.assist || []).filter(a => a !== 'Ingen').join(', ') || 'Ingen',
        'Vagtlæge rekvireret kl.': (t.reqTimes && t.reqTimes['Vagtlæge']) || '',
        'Ambulance rekvireret kl.': (t.reqTimes && t.reqTimes['Ambulance']) || '',
        'Assistance andet': t.assistOther || ''
      };
      MATS.forEach(m => { r['Mat. ' + m] = (t.mats && t.mats[m]) || 0; });
      Object.assign(r, {
        'Mat. andet (hvad)': t.matOther || '',
        'Navn/tlf. indsamlet': yesNo(t.contact),
        'Enhed': device,
        'Version': t.version || 1,
        'Status': t.status,
        'Oprettet': stamp(t.createdAt),
        'Sidst ændret': stamp(t.updatedAt),
        'Id': t.id
      });
      return r;
    });

    const skader = [];
    sorted.forEach(t => t.injuries.forEach((i, n) => skader.push({
      'Journalnr.': t.jnr,
      'Skade nr.': n + 1,
      'Dato': date(t.start),
      'Legemsdel': i.part,
      'Side': i.view === 'back' ? 'Bagside' : 'Forside',
      'Skadetype': i.kind,
      'Beskrivelse': i.desc || '',
      'Årsag': i.cause || '',
      'Område': loc(i),
      'Rum': i.loc && i.loc !== 'Andet' ? (i.room || '') : '',
      'Triage': t.triage,
      'Melding': t.urgency
    })));

    const vagter = shifts.slice().sort((a, b) => (a.start || '').localeCompare(b.start || '')).map(s => ({
      'Førstehjælper': s.userName,
      'Dato': date(s.start),
      'Start': time(s.start),
      'Slut': time(s.end),
      'Behandlinger': treatments.filter(t => t.shiftId === s.id).length,
      'Enhed': device
    }));
    return { beh, skader, vagter };
  }

  function sheet(data, headers) {
    const ws = data.length ? XLSX.utils.json_to_sheet(data) : XLSX.utils.aoa_to_sheet([headers]);
    const keys = data.length ? Object.keys(data[0]) : headers;
    ws['!cols'] = keys.map(k => {
      const longest = Math.max(k.length, ...data.map(r => String(r[k] == null ? '' : r[k]).length));
      return { wch: Math.min(60, Math.max(8, longest + 2)) };
    });
    return ws;
  }

  const Export = {
    toXlsx(treatments, shifts, device) {
      if (!window.XLSX) throw new Error('Eksportmodulet kunne ikke indlæses.');
      const r = rows(treatments, shifts, device);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet(r.beh, ['Journalnr.']), 'Behandlinger');
      XLSX.utils.book_append_sheet(wb, sheet(r.skader, ['Journalnr.']), 'Skader');
      XLSX.utils.book_append_sheet(wb, sheet(r.vagter, ['Førstehjælper']), 'Vagter');
      const now = new Date().toISOString();
      const safe = String(device || 'enhed').replace(/[^\wæøåÆØÅ-]+/g, '-');
      const name = 'skadesmelding-' + safe + '-' + date(now) + '-' + time(now).replace(':', '') + '.xlsx';
      XLSX.writeFile(wb, name, { compression: true });
      return { name, count: treatments.length };
    }
  };

  window.Export = Export;
})();
