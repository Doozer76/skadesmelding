# Skadesmelding – testversion (bid 1)

Mobil webapp til registrering af førstehjælpsbehandlinger ved Dystopia Haunted House.
Testversionen har **ingen server**: alt gemmes lokalt på den enkelte enhed (IndexedDB).

## Prøv den på computeren
- **Hurtigst:** Dobbeltklik på `index.html` (Chrome eller Edge). Alt virker undtagen offline-installation.
- **Som rigtig app (offline + installering):** Kør en lokal webserver i mappen, fx
  `npx serve .` eller `python -m http.server 8000`, og åbn `http://localhost:8000`.
- På telefoner kræver det, at appen ligger på en https-adresse (fx GitHub Pages). Det sættes op senere.

## Første gang på en enhed
Appen beder om enhedens navn, nummerserie (fx 1–199), sæsonprefix (hh26) og PIN til dashboardet.
Hver telefon skal have sin egen nummerserie, så journalnumre ikke kolliderer.

## Filer
| Fil | Indhold |
|---|---|
| `index.html` | Selve siden |
| `js/app.js` | Skærme, flow og handlinger (bygget efter mockuppen) |
| `js/store.js` | Al lokal lagring (IndexedDB) – det eneste sted der rører data |
| `js/sync.js` | Plads til afsendelse til server. Gør intet i testversionen |
| `js/export.js` | Excel-eksport (faner: Behandlinger, Skader, Vagter) |
| `sw.js` | Offline-cache. **Hæv `CACHE`-versionen ved hver ændring** |
| `manifest.webmanifest`, `icons/` | Installering på hjemmeskærm |
| `vendor/xlsx.mini.min.js` | SheetJS 0.18.5 (Excel-bibliotek) |
| `fonts/` | Atkinson Hyperlegible, så skriften virker offline |

## Når backend kommer
Kun `sync.js` (afsendelse) og journalnummer-tildelingen i `app.js` (`takeJnr`) skal ændres.
Hver behandling har allerede et unikt `id`, `version`, `status`, `createdAt` og `updatedAt`.

## Testdata
Dashboard → "Slet alle testdata" rydder førstehjælpere, vagter og behandlinger og starter numrene forfra.
