/* sync.js – forbindelsen til en server.
 * I testversionen findes der ingen server: alt bliver liggende lokalt med status "lokal".
 * Når backend er klar, implementeres de tre funktioner herunder, og resten af appen
 * behøver ikke ændres:
 *   enqueue(record)   – læg en ny/ændret behandling i kø til afsendelse
 *   flush()           – send køen (kaldes når forbindelsen er god)
 *   pending(list)     – antal behandlinger der endnu ikke er sendt
 */
(function () {
  'use strict';
  const MODE = 'local'; // 'local' = kun på enheden. Senere: 'server'.

  const Sync = {
    mode: MODE,
    enabled: () => MODE !== 'local',
    statusFor: () => (MODE === 'local' ? 'lokal' : 'i kø'),
    enqueue: async () => { /* Ingen server endnu. */ },
    flush: async () => 0,
    pending: list => (MODE === 'local' ? 0 : list.filter(t => t.status === 'i kø').length)
  };

  window.Sync = Sync;
})();
