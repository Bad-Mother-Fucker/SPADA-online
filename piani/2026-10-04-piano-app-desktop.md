---
type: plan
date: 2026-10-04
status: proposto
tags: [spada, app-desktop, tauri, cloudflare, login-google, sync]
---

SPADA installabile sul Mac e sul PC Windows di ogni membro del team, con login Google e le gare condivise sul cloud, senza cambiare il design né spostare la pipeline dal computer dell'utente.

## La richiesta, chiarita

- **Chi la usa.** Prima il team (poche persone, più volte al giorno), poi clienti esterni: ogni organizzazione vede solo le sue gare, quindi account e dati vanno separati per organizzazione fin dal primo giorno.
- **Come si fa oggi.** SPADA gira su un solo Mac con `./spada avvia`; ogni gara è una cartella in `~/spada/gare/<slug>` (418 MB per la gara di prova, di cui 405 MB di PDF in `input/`, 5 MB di output, 5 MB di stato, 0,5 MB di grafo). Per condividerla non c'è un modo: si copia la cartella. Un collega senza terminale non la può usare. Il costo non è in minuti per volta: la gara è prigioniera di una macchina.
- **Decisioni prese il 2026-10-04.** La pipeline continua a girare sul computer di ogni utente, con il suo Claude Code e la sua subscription. Il cloud tiene documenti, output e stato. Unico servizio già pagato: Cloudflare (account, dominio prometheus-spada.it, esperienza con Tunnel, Pages e Access dalla versione online).
- **Cosa deve uscire.** Un installer per macOS e uno per Windows; login con account Google; elenco gare dell'organizzazione; la stessa gara aperta da più macchine; mentre una fase gira su una macchina le altre lo vedono e non la possono lanciare; stesso DESIGN.md.
- **Cosa non deve fare.** Non tocca le credenziali Claude dell'utente; non fa girare la pipeline sul cloud; non cambia i contratti delle API locali esistenti.

## Cosa esiste già

### In casa

- `app/web` è già pronta per un guscio desktop: parla col backend solo via API e SSE, usa localStorage solo per tema e dimensione dell'assistente. Nessuna modifica di aspetto necessaria.
- `app/backend` + `app/worker`: FastAPI, SQLite, worker che lancia bash e `claude -p`. Tutti i percorsi derivano da `SPADA_HOME` (`app/backend/paths.py`). Nessuna nozione di utente né di organizzazione (tabelle: gare, job, documenti, approvazioni, conversazioni, proposte_operatore, interventi).
- Il modello di login Claude richiesto dai termini c'è già: `./spada login` autentica il binario `claude` non modificato in una `CLAUDE_CONFIG_DIR` dedicata (`~/spada/_claude`), e `get_claude_env()` in `app/backend/auth.py` inietta l'ambiente nel subprocess.
- Ogni gara è un repository git con un solo commit (quello iniziale): la pipeline non committa, quindi git non è un trasporto di sync già pronto.
- `infra/` su `origin/main`: Cloudflare Tunnel verso `api.prometheus-spada.it`, Pages, Access con identità singola, unit systemd, deploy via GitHub Actions. La VM era Oracle Cloud Always Free, oggi spenta.
- Prezzario regionale: 160 MB di SQLite, uguale per tutti, in sola lettura.
- Nessuna skill, plugin, progetto o riga di cronologia sul disco riguarda Tauri, Electron, Firebase o Supabase.

### Negli strumenti che paghiamo

- **Cloudflare**, l'unico. Copre tutto: R2 (file), D1 (indice), Durable Objects (lucchetto e tempo reale), Workers (API), Zero Trust Free (50 utenti) con Google come identità. Dettagli e prezzi nella sezione Fuori.
- Railway: un progetto non legato a SPADA, piano non pagato. Non serve.
- Nessun Google Workspace: il login accetta qualunque account Google e l'organizzazione decide chi entra.

### Nell'ecosistema Claude

- [codice] peditx/tauri-skills, 55 stelle, MIT, push 2026-07: skill per Claude Code su sidecar Python a quattro livelli, PyInstaller, updater, CI a matrice. Da leggere e adattare, non da installare alla cieca. https://github.com/peditx/tauri-skills
- [codice] dchuk/claude-code-tauri-skills, 35 stelle, senza licenza, 39 skill con sidecar (README 404 al 2026-10-04). https://github.com/dchuk/claude-code-tauri-skills
- [codice] full-stack-skills/tauri-skills, 19 stelle, Apache, push 2026-10-03. https://github.com/full-stack-skills/tauri-skills
- Niente su Electron con trazione.

### Fuori

**Guscio desktop (SPA React + backend Python)**

- [fonte ufficiale] Tauri v2, sidecar: `externalBin` col suffisso del target, permesso `shell:allow-execute`, PyInstaller come caso tipico. https://v2.tauri.app/develop/sidecar/
- [fonte ufficiale] Tauri, Windows: installer NSIS o MSI; il bootstrapper di WebView2 richiede internet, l'installer offline pesa 127 MB in più. https://v2.tauri.app/distribute/windows-installer/
- [fonte ufficiale] Tauri, firma: Developer ID e notarizzazione via App Store Connect API su macOS; certificato OV o EV su Windows contro SmartScreen; updater con firma minisign obbligatoria. https://v2.tauri.app/distribute/sign/macos/ https://v2.tauri.app/distribute/sign/windows/ https://v2.tauri.app/plugin/updater/
- [esperienza + codice] Tauri + FastAPI + PyInstaller (benitomartin/tauri-app-bundle, MIT, 2026-02): serve lo spec file e non `--onefile`; UTF-8 su Windows; porta occupata = backend che muore in silenzio; eseguibile 35-40 MB. https://aiechoes.substack.com/p/building-production-ready-desktop
- [esperienza] Smoodit, da Electron a Tauri con sidecar FastAPI: quarantena `xattr`, hang della PIPE, processi zombie, health check a polling. https://thenote.app/post/en/story-of-smoodit-1-electron-to-tauri-qs9vniei7w
- [codice] Tauri #15134, aperta al 2026-03: l'aggiornamento NSIS non sostituisce il sidecar PyInstaller. https://github.com/tauri-apps/tauri/issues/15134
- [esperienza] PyInstaller, i manutentori: onefile su macOS non si notarizza davvero, usare onedir; falsi positivi antivirus anche su binari firmati. https://github.com/pyinstaller/pyinstaller/discussions/8167 https://discuss.python.org/t/pyinstaller-false-positive/43171
- [esperienza] DoltHub 2025-11, Electron contro Tauri: un "hello world" Electron pesa 150 MB; i webview non sono uno strato uniforme (WebKit su macOS, WebView2 su Windows). https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/ https://news.ycombinator.com/item?id=46082291
- [codice] Electron + Python: l'esempio più citato (fyears/electron-python-example, 2088 stelle) è fermo dal 2020; nessun template vivo. Simon Willison impacchetta python-build-standalone in `extraResources`. https://til.simonwillison.net/electron/python-inside-electron
- [codice] Alternativa: pywebview, 6079 stelle, BSD-3, vivo: Python guida la finestra. https://github.com/r0x0r/pywebview

**Claude Code sulle macchine degli utenti e termini d'uso**

- [fonte ufficiale] Windows 10 1809 o più recente, installer nativo, WinGet o npm. Git for Windows opzionale: con Git Bash gli agenti hanno il tool Bash, senza hanno PowerShell. `CLAUDE_CODE_GIT_BASH_PATH` per indicare la bash. https://code.claude.com/docs/en/setup https://code.claude.com/docs/en/tools-reference
- [fonte ufficiale] `claude -p` headless: hook e `.mcp.json` caricati; `--bare` non legge l'OAuth; stdin su Windows corretto dalla 2.1.211. https://code.claude.com/docs/en/headless
- [fonte ufficiale] `CLAUDE_CONFIG_DIR` separa account e credenziali; `claude setup-token` dà un token OAuth annuale da passare in `CLAUDE_CODE_OAUTH_TOKEN`. https://code.claude.com/docs/en/authentication
- [fonte ufficiale] Termini: l'OAuth della subscription è per l'uso ordinario di Claude Code; chi sviluppa prodotti usa API key; vietato intermediare credenziali. Però "running Claude Code in your products" è consentito accettando i Commercial Terms, con binario non modificato, ogni utente con le proprie credenziali (subscription inclusa), nessuna rivendita. https://code.claude.com/docs/en/legal-and-compliance
- [fonte ufficiale] Il credito Agent SDK per gli strumenti terzi è sospeso: oggi tutto consuma i limiti della subscription. https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- [esperienza] Anthropic su X: "chi costruisce un business sull'Agent SDK usa API key"; "le subscription non sono nate per strumenti terzi". https://x.com/trq212/status/2024212380142752025 https://x.com/bcherny/status/2040213608064491525
- [esperienza] Cronologia delle restrizioni gennaio-maggio 2026 e dibattito HN (1099 punti). https://falcao.org/posts/anthropic-claude-access-crackdown-ecosystem-fallout/ https://news.ycombinator.com/item?id=47633396
- Gli script bash della pipeline: nessuna fonte dice se girano in Git Bash; `pdftotext` è chiamato dall'agente document-preprocessor e su Windows va messo nel PATH (poppler per Windows esiste).

**Login Google da un'app desktop**

- [fonte ufficiale] Google per app installate: PKCE con redirect su loopback `http://127.0.0.1:porta`; webview embedded bloccate dal 2021 (`disallowed_useragent`); refresh token sempre rilasciato. https://developers.google.com/identity/protocols/oauth2/native-app
- [fonte ufficiale] Trappola: con il consent screen in stato "Testing" il refresh token scade dopo 7 giorni; scade anche dopo 6 mesi di inattività. https://developers.google.com/identity/protocols/oauth2#expiration
- [codice] better-auth, 30.200 stelle, MIT, push 2026-10-04; better-auth-cloudflare (594 stelle, MIT, D1/KV/R2); better-auth-tauri (83 stelle, MIT); tauri-plugin-oauth (216 stelle, Apache-2.0, push 2026-10-04: server localhost temporaneo, nato perché Google rifiuta gli schemi custom). https://github.com/better-auth/better-auth https://github.com/zpg6/better-auth-cloudflare https://github.com/daveyplate/better-auth-tauri https://github.com/FabianLars/tauri-plugin-oauth
- [fonte ufficiale] Cloudflare Access con Google come identità: gratis fino a 50 utenti, poi 7 $ per utente al mese. Da un'app nativa il flusso documentato passa solo dal binario `cloudflared`; nessuna esperienza trovata con Tauri o Electron. https://www.cloudflare.com/plans/zero-trust-services/ https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/
- [fonte ufficiale] Deep link: su macOS gli schemi si registrano in config; su Windows arrivano come argv a un nuovo processo e serve single-instance. Con il loopback il deep link non serve. https://v2.tauri.app/plugin/deep-linking/

**File, stato, lucchetto e tempo reale su Cloudflare** (prezzi letti il 2026-10-04)

- [fonte ufficiale] R2: 0,015 $ per GB al mese, egress gratis, 10 GB gratis; oggetto fino a 5 TiB, upload singolo 5 GiB, multipart 10.000 parti; URL presigned da 1 secondo a 7 giorni; credenziali temporanee limitate a un bucket e a un prefisso. https://developers.cloudflare.com/r2/pricing/ https://developers.cloudflare.com/r2/platform/limits/ https://developers.cloudflare.com/r2/api/s3/temporary-credentials/
- [fonte ufficiale] I Worker accettano corpi fino a 100 MB (200 su Business): i PDF da 400 MB devono andare diretti su R2. https://developers.cloudflare.com/workers/platform/limits/
- [fonte ufficiale] D1: 10 GB per database, Time Travel 30 giorni sul Paid, hint di località `weur`; Free 5 milioni di letture e 100.000 scritture al giorno; Paid 25 miliardi di letture e 50 milioni di scritture al mese inclusi. Un database per organizzazione richiede riconfigurare il Worker via API: praticabile un solo database con `org_id`. https://developers.cloudflare.com/d1/platform/limits/ https://developers.cloudflare.com/d1/platform/pricing/ https://github.com/cloudflare/workerd/discussions/3564
- [esperienza] D1: latenze sporadiche di 20-40 secondi su database di 3 MB in WEUR (settembre 2026), "400 ms e oltre" su query semplici (HN aprile 2025). https://community.cloudflare.com/t/d1-sporadic-long-tail-latency-20s/956400 https://news.ycombinator.com/item?id=43572511
- [fonte ufficiale] Durable Objects: Workers Paid 5 $ al mese con 1 milione di richieste e 400.000 GB-s inclusi; Free 100.000 richieste al giorno con storage SQLite; alarm uno per oggetto con retry; ibernazione dopo 10 secondi con WebSocket che restano connessi; `jurisdiction("eu")` alla creazione, poi l'oggetto non si sposta più. https://developers.cloudflare.com/durable-objects/platform/pricing/ https://developers.cloudflare.com/durable-objects/api/alarms/ https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/ https://developers.cloudflare.com/durable-objects/reference/data-location/
- [esperienza] 34.895 $ in 8 giorni per un `setAlarm` in loop senza `getAlarm`, senza alert e senza tetto di spesa. https://news.ycombinator.com/item?id=47787042
- [codice] tldraw sync (50.700 stelle): un Durable Object per stanza, presenza effimera, sessioni negli attachment. partykit (1.300 stelle, ISC) e cloudflare/actors (426 stelle, MIT). https://tldraw.dev/docs/sync https://github.com/cloudflare/partykit https://github.com/cloudflare/actors
- [esperienza] Wire lascia i Durable Objects (luglio 2026): nessuna estensione SQLite, oggetto mai rilocabile, niente self-host. Copes in produzione multi-tenant: "D1 non è in ogni edge, non mettere file grandi in D1". https://usewire.io/engineering/why-were-moving-wire-off-cloudflare-durable-objects/ https://flaviocopes.com/production-at-the-edge/
- [esperienza] Lucchetto con lease: senza scadenza un crash lascia il job "in esecuzione" per sempre; heartbeat al massimo a metà del lease; fencing token monotono perché un processo in pausa non scriva dopo la scadenza. https://webdock.io/en/docs/how-guides/programming-guides/handling-worker-crashes-with-heartbeat-based-leases https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

**Strade valutate e scartate**

- [codice + fonte ufficiale] Sync engine local-first: PowerSync (SDK Apache, cloud da 49 $ al mese), ElectricSQL (Apache, 10.400 stelle, Pro 249 $), Zero (Apache, 1.0 a giugno 2026, solo Postgres 15 con logical replication, Hobby 30 $), Jazz (riscrittura in corso), Triplit (fermo da settembre 2025), Turso (sync "last push wins"). Tutti senza SDK Python o con Postgres obbligatorio: il backend locale è Python e lo stato vivo è un JSON per gara. https://powersync.com/pricing https://electric-sql.com/cloud/pricing https://zero.rocicorp.dev/docs/connecting-to-postgres https://docs.turso.tech/sync/usage https://github.com/aspen-cloud/triplit
- [fonte ufficiale + esperienza] Git come trasporto: GitHub blocca i file sopra 100 MiB, LFS costa 0,07 $ per GiB al mese più banda e crea lock-in; `.git` dentro cartelle sincronizzate si corrompe. https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github https://news.ycombinator.com/item?id=44916783 https://forum.syncthing.net/t/is-putting-a-git-workspace-in-a-synced-folder-really-a-good-idea/1774
- [fonte ufficiale] Alternative complete a Cloudflare, se cede: Supabase Pro 25 $ al mese (Francoforte, Postgres, auth Google, storage con file fino a 500 GB, client Python ufficiale); Firebase a consumo (proprietario); Appwrite Pro 25 $ (Francoforte, BSD-3); PocketBase (MIT, un solo server, senza hosting); Convex Pro 25 $ per sviluppatore (Dublino). https://supabase.com/pricing https://firebase.google.com/pricing https://appwrite.io/pricing https://pocketbase.io/faq/ https://www.convex.dev/pricing
- [esperienza] REST con polling frequente al posto di un sync engine: scelta di chi ha valutato Electric e ha preferito JSON e rilettura. https://www.finkelstein.fr/sqlite-sync-engine-with-reactivity

## Verdetto

**Esiste a metà.** Ogni pezzo ha un esempio vivo (Tauri con sidecar Python, better-auth su D1 con il plugin Tauri, R2 con credenziali per prefisso, un Durable Object per gara con lease e WebSocket), ma nessuno copre l'assemblaggio con una pipeline locale che scrive cartelle. Il pezzo che manca, e che è il piano, è un registro cloud sottile su Cloudflare e un backend locale che impara a sincronizzare.

- Usa cose che ci sono già: sì. `app/web`, backend, worker e pipeline restano; l'account e il dominio Cloudflare ci sono; il modello di login Claude è quello di `./spada login`.
- Aggiunge un abbonamento: Workers Paid 5 $ al mese quando si esce dal piano gratuito; Apple Developer Program 99 $ l'anno per la notarizzazione; una firma Windows (Azure Trusted Signing circa 10 $ al mese, o un certificato OV da 200-400 $ l'anno). Claude: ogni utente la propria subscription, come oggi.
- Tocca dati di clienti: sì, PDF di gara e offerte tecniche. Vanno in R2 e Durable Objects con giurisdizione EU, sotto un prefisso per organizzazione, con credenziali temporanee limitate al prefisso.

## Il piano

Quattro passi, ognuno utile da solo. Alla fine di ogni passo ci si ferma e si aspetta conferma, come per il redesign.

**Passo 1, guscio macOS (3-4 giorni).** Tauri v2 attorno a `app/web/dist`. Backend e worker diventano un sidecar PyInstaller in modalità onedir, avviato su una porta libera scelta a runtime, con health check prima di mostrare la finestra. `claude` si cerca nel PATH dell'utente; se manca, la schermata iniziale spiega come installarlo; il login Claude si fa dall'app, che apre `claude auth login` con una `CLAUDE_CONFIG_DIR` nella cartella dati dell'app, esattamente come `./spada login`. Il prezzario (160 MB) si scarica al primo avvio da R2. `.dmg` firmato e notarizzato, updater con minisign. Risultato: un collega installa SPADA senza terminale, con le gare ancora locali alla sua macchina. Il guscio sostituisce `./spada setup`, `login` e `avvia`; `caffeinate` resta solo su macOS.

**Passo 2, registro cloud e gara condivisa (1-2 settimane).** Un Worker su Cloudflare (Hono, better-auth con adapter D1, Google con PKCE e loopback tramite tauri-plugin-oauth). D1 tiene solo l'indice: utenti, organizzazioni, membri, inviti, gare (slug, titolo, organizzazione, versione). Un Durable Object per gara, creato con `jurisdiction("eu")`, tiene lo stato vivo (`fasi.json`, sommario del run log, risposte e indicazioni della Fase 4, approvazioni), il lucchetto (fase, macchina, utente, scadenza a 15 minuti, fencing token) e manda WebSocket alle altre macchine. R2, bucket EU, prefisso `org/<id>/gara/<slug>/`: `input/` caricato direttamente dal desktop in multipart con credenziali temporanee; `output/`, `02_graph/` e lo snapshot di `_state/` caricati dal backend locale a fine fase.

Nel backend locale nasce un modulo `sync`, senza toccare le API esistenti: all'apertura della gara scarica manifest, stato e output; prima di eseguire una fase chiede il lease al Durable Object e, se manca, scarica `input/`; il worker manda un heartbeat ogni 5 minuti; a fine fase carica output e stato e rilascia il lease col fencing token. Le scritture umane (risposte, indicazioni, approvazioni) passano dal Durable Object con un numero di versione. Regola di coerenza: scrive solo chi ha il lease, gli altri leggono; non esistono merge. Lease scaduto senza heartbeat: la fase diventa "interrotta su <macchina>" e chiunque può rieseguirla. Nell'interfaccia si aggiungono solo la schermata di login, il selettore dell'organizzazione e il badge "in esecuzione su <macchina> da hh:mm" con il pulsante Esegui disabilitato. Le gare già in `~/spada/gare` si importano nell'organizzazione del team con un comando.

**Passo 3, Windows (1-2 settimane, dopo uno spike di un giorno).** Prima lo spike, su un PC con Claude Code nativo, Git for Windows e poppler: eseguire a mano `spada_fase.sh 1` su una gara piccola sotto Git Bash e scrivere l'elenco di cosa si rompe (percorsi, `python3` contro `python`, `caffeinate`, i symlink di `link_pipeline.sh` da sostituire con copie o junction, P7M in `new_gara.sh`, `pdftotext` nel PATH). Solo dopo: installer NSIS con bootstrapper WebView2, sidecar PyInstaller per Windows, firma, single-instance. Il login via loopback evita il deep link.

**Passo 4, organizzazioni per i clienti (1 settimana).** Inviti via email, ruoli (titolare, membro), pagina membri, quota R2 per organizzazione, esportazione e cancellazione di una gara con rimozione degli oggetti su R2. Sul lato Claude: una pagina che spiega che ogni utente accede col proprio account nel binario non modificato, e la variabile `SPADA_ANTHROPIC_API_KEY` per organizzazione come alternativa pronta, iniettata da `get_claude_env()`, se Anthropic restringe ancora. La fatturazione resta fuori.

Dove resta una persona: il login Claude di ogni utente, l'avvio delle fasi, i gate umani delle Fasi 6 e 8, come oggi.

## Idee prese da fuori, trappole già pagate

- **Sidecar onedir, firmato, con porta dinamica e health check.** Da benitomartin e Smoodit: onefile non si notarizza, la porta occupata uccide il backend in silenzio, la PIPE piena blocca il processo. https://aiechoes.substack.com/p/building-production-ready-desktop https://thenote.app/post/en/story-of-smoodit-1-electron-to-tauri-qs9vniei7w
- **Nome del sidecar con la versione dentro**, perché l'aggiornamento NSIS non sostituisce il binario (Tauri #15134). `da provare`. https://github.com/tauri-apps/tauri/issues/15134
- **Consent screen Google in produzione prima del primo collega**: in "Testing" il refresh token muore dopo 7 giorni. https://developers.google.com/identity/protocols/oauth2#expiration
- **PDF diretti su R2, mai attraverso il Worker** (100 MB per richiesta). https://developers.cloudflare.com/workers/platform/limits/
- **`getAlarm` prima di `setAlarm`, tetto di spesa e alert dal primo giorno**: 34.895 $ in 8 giorni a chi non l'ha fatto. https://news.ycombinator.com/item?id=47787042
- **Stato vivo nel Durable Object, D1 solo come indice**: le code sporadiche di D1 non devono bloccare l'apertura di una gara. https://community.cloudflare.com/t/d1-sporadic-long-tail-latency-20s/956400
- **Un Durable Object per gara con presenza negli attachment**, come tldraw sync. https://tldraw.dev/docs/sync
- **Lease con heartbeat a metà scadenza e fencing token**, da Kleppmann. https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
- **Tailwind v4 e il webview di macOS**: la SPA richiede Safari 16.4 o più recente, cioè macOS 13.3; il minimo supportato va dichiarato nel bundle. `da provare` sul Mac più vecchio del team. https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/
- **Cloudflare Access davanti al Worker come secondo livello solo per il team**: `da provare`, perché nessuno documenta il flusso da Tauri. Non è il login utente.
- **Se Cloudflare cede** (Durable Objects non rilocabili, niente self-host, supporto scarso): Supabase Pro a 25 $ al mese a Francoforte è la riserva, con client Python ufficiale. https://usewire.io/engineering/why-were-moving-wire-off-cloudflare-durable-objects/ https://supabase.com/pricing
- **Termini Claude**: binario non modificato, login col flusso Anthropic, Commercial Terms accettati, nessuna rivendita; e la via API key tenuta pronta. https://code.claude.com/docs/en/legal-and-compliance

## Cosa serve

- Cloudflare: Workers Paid (5 $ al mese), un bucket R2 in EU, un database D1 con hint `weur`, Durable Objects. Costo variabile stimato: 100 gare da 400 MB sono 40 GB, cioè 0,60 $ al mese su R2, egress gratis.
- Apple Developer Program (99 $ l'anno) per firmare e notarizzare il `.dmg`.
- Firma Windows: Azure Trusted Signing (circa 10 $ al mese, da verificare l'idoneità dell'azienda) o un certificato OV (200-400 $ l'anno). Senza firma SmartScreen blocca l'installer.
- Un progetto Google Cloud gratuito per l'OAuth: consent screen in produzione, scope `email` e `profile` (nessuna verifica richiesta per questi scope).
- Un PC Windows 11 per lo spike e i test del passo 3.
- Nessuna chiave Anthropic sul cloud: Claude resta sul computer di ogni utente.
- Tempo: 3-4 giorni, 1-2 settimane, 1-2 settimane, 1 settimana.

## Come si capisce se ha funzionato

Date proposte, da confermare.

- **Entro il 15/11/2026 (passo 1).** Un collega installa SPADA su un Mac da un `.dmg`, senza aprire il terminale, fa login Claude dall'app, crea una gara ed esegue la Fase 1: dal download alla fase avviata in meno di 15 minuti.
- **Entro il 15/12/2026 (passo 2).** Con due Mac nella stessa organizzazione: la gara creata sul primo compare sul secondo entro 5 secondi; il secondo esegue la Fase 4; sul primo il pulsante Esegui si disabilita con il nome della macchina entro 5 secondi e si riabilita a fine fase con l'output leggibile. Se il secondo chiude il coperchio a metà, entro 20 minuti la fase risulta "interrotta" e il primo può rieseguirla.
- **Entro il 31/01/2027 (passo 3).** La stessa prova con il secondo computer su Windows 11.

## Il brief per partire

```
LAVORO
SPADA come app installabile su macOS e Windows, con lo stesso design di
app/web (DESIGN.md), in cui ogni utente fa login con il proprio account
Google e vede le gare della propria organizzazione. Una gara creata su una
macchina si apre dalle altre; una fase lanciata su una macchina risulta
"in esecuzione su <macchina>" sulle altre, dove non si può lanciare; a
fine fase l'output compare ovunque. La pipeline gira sul computer
dell'utente con il suo Claude Code e la sua subscription, come oggi con
./spada. Quattro passi, ognuno utile da solo: 1 guscio macOS, 2 registro
cloud e gara condivisa, 3 Windows, 4 organizzazioni per i clienti. Alla
fine di ogni passo ci si ferma e si aspetta conferma.

PERCHE'
Per il team di chi prepara offerte di gara, oggi su un solo Mac via
terminale: la gara è prigioniera di quella macchina (418 MB in
~/spada/gare/<slug>) e un collega senza terminale non può usarla. Con
l'app ogni membro installa, accede e lavora sulla stessa gara dal proprio
computer; la stessa base serve poi ai clienti esterni, ognuno con le sue
gare separate.

PALETTI
- La pipeline resta sul computer dell'utente, con il binario `claude` non
  modificato e il login fatto dall'utente col flusso di Anthropic (come
  ./spada login, con CLAUDE_CONFIG_DIR dedicata): è ciò che i termini di
  Claude Code consentono, e l'app non vede né intermedia credenziali
  Claude. Tieni pronta la via ANTHROPIC_API_KEY per organizzazione:
  Anthropic ha già ristretto l'uso delle subscription da strumenti terzi
  e può farlo ancora.
- app/web non cambia aspetto: DESIGN.md vince. Si aggiungono solo login,
  selettore dell'organizzazione e stato del lucchetto.
- Le API locali esistenti non cambiano contratto, perché il frontend ci
  si appoggia e un'altra sessione lavora sulla pipeline: si aggiungono
  endpoint, non si modificano.
- Scrive sul cloud solo la macchina che ha il lease della gara; le altre
  leggono. Così non esistono conflitti da fondere e lo stato è sempre
  quello di chi ha eseguito.
- I PDF vanno diretti su R2 con credenziali temporanee limitate al
  prefisso dell'organizzazione: i Worker accettano 100 MB per richiesta,
  e un cliente non deve poter leggere il prefisso di un altro.
- Dati in giurisdizione EU (bucket R2 EU, Durable Object con
  jurisdiction("eu"), D1 weur): sono documenti di gara e offerte
  tecniche di aziende.
- getAlarm prima di ogni setAlarm e tetto di spesa su Cloudflare dal
  primo giorno: un alarm in loop è costato 35 mila dollari a qualcun
  altro.
- Sidecar PyInstaller in modalità onedir, firmato e notarizzato: onefile
  non si notarizza davvero.
- Prima di costruire l'installer Windows si fa lo spike: una fase vera
  sotto Git Bash su un PC Windows, con l'elenco di cosa si rompe.
- Costi fissi accettati: Workers Paid 5 $/mese, Apple Developer 99 $/anno,
  firma Windows. Nessun altro servizio senza chiedere.

FINITO
- Passo 1: un .dmg firmato e notarizzato. Su un Mac senza terminale, in
  15 minuti dal download, un collega installa, fa login Claude dall'app,
  crea una gara ed esegue la Fase 1. ./spada avvia non serve più dove
  c'è l'app.
- Passo 2: due Mac nella stessa organizzazione. La gara creata sul primo
  compare sul secondo entro 5 secondi; il secondo esegue la Fase 4; sul
  primo il pulsante Esegui si disabilita con "in esecuzione su <nome
  macchina>" entro 5 secondi e si riabilita a fine fase con l'output
  leggibile; se il secondo chiude il coperchio a metà, entro 20 minuti la
  fase risulta "interrotta su <macchina>" e il primo può rieseguirla. Un
  utente di un'altra organizzazione non vede la gara né nell'interfaccia
  né chiamando R2 con le proprie credenziali temporanee: un `aws s3 ls`
  sul prefisso altrui risponde AccessDenied, prova da rifare a ogni
  rilascio.
- Passo 3: la stessa prova del passo 2 con il secondo computer su
  Windows 11 e un installer .exe firmato.
- Passo 4: un invito via email porta un utente nuovo in un'organizzazione
  nuova; il titolare esporta e cancella una gara e R2 non ne conserva
  oggetti.
- Sempre: `npm run build` e `tsc` puliti; screenshot con
  app/web/dev/screenshot.mjs dei tre stati nuovi (login, lucchetto,
  interrotta) in tema chiaro e scuro.

RIFERIMENTI
- piani/2026-10-04-piano-app-desktop.md: questo piano, con i link alle
  fonti e le trappole.
- app/web: la SPA; app/web/dev/mock-api.mjs e screenshot.mjs per gli
  stati di rete e gli scatti.
- app/backend/paths.py (tutto deriva da SPADA_HOME), app/backend/auth.py
  (get_claude_env: come si inietta l'ambiente Claude nel subprocess),
  app/worker/worker.py (esegui_job: dove mettere lease e heartbeat),
  app/backend/schema_app.sql.
- _pipeline/scripts/setup/spada_fase.sh e spada_comune.sh: cosa scrive
  una fase e dove; link_pipeline.sh: i symlink da sostituire su Windows;
  new_gara.sh: il trattamento dei P7M.
- spada (launcher): cmd_setup, cmd_login, cmd_avvia sono ciò che il
  guscio deve rifare dentro l'app.
- infra/ su origin/main: Tunnel, Pages e Access della versione online;
  config cloudflared con api.prometheus-spada.it.
- Guscio: https://v2.tauri.app/develop/sidecar/ ,
  https://github.com/peditx/tauri-skills (leggere e adattare),
  https://aiechoes.substack.com/p/building-production-ready-desktop ,
  https://github.com/tauri-apps/tauri/issues/15134
- Claude Code: https://code.claude.com/docs/en/legal-and-compliance ,
  https://code.claude.com/docs/en/setup ,
  https://code.claude.com/docs/en/headless ,
  https://code.claude.com/docs/en/authentication
- Login: https://developers.google.com/identity/protocols/oauth2/native-app ,
  https://github.com/better-auth/better-auth ,
  https://github.com/zpg6/better-auth-cloudflare ,
  https://github.com/daveyplate/better-auth-tauri ,
  https://github.com/FabianLars/tauri-plugin-oauth
- Cloud: https://developers.cloudflare.com/r2/api/s3/temporary-credentials/ ,
  https://developers.cloudflare.com/durable-objects/api/alarms/ ,
  https://developers.cloudflare.com/durable-objects/reference/data-location/ ,
  https://tldraw.dev/docs/sync ,
  https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

PRIMA DI PARTIRE
Intervistami una domanda alla volta su quello che resta ambiguo, a
partire dalle domande la cui risposta cambierebbe l'impostazione: nome
dell'app e bundle id; se il primo collega è su Mac o su Windows; chi paga
Apple Developer e la firma Windows; il Mac più vecchio del team. Poi vai
fino in fondo senza chiedere il permesso per le cose reversibili. Parti
dal passo 1 e fermati alla fine di ogni passo.
```

## Cosa resta fuori

- Fatturazione e pagamenti dei clienti.
- App Store e Microsoft Store, Linux, iOS e Android.
- Versione web ospitata e pipeline sul server (scelta esclusa il 2026-10-04).
- Modifica concorrente dello stesso testo: vale il lucchetto, non la collaborazione in tempo reale.
- Prezzario sul cloud: resta locale, scaricato una volta.
- Migrazione da SQLite a Postgres nel backend locale.
- Cloudflare Access come login utente (resta un `da provare` come secondo livello per il solo team).

## Dove si è cercato

- **In casa.** Termini tauri, electron, desktop, google, oauth, firebase, supabase, sync, offline in `~/.claude/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md` e `~/.claude/plugins` (solo riferimenti generici in use-railway e design-taste-frontend); `~/.claude/commands` assente; `~/.claude/settings.json`; `package.json` sotto `~/Progetti` (nessuno con Tauri o Electron); cronologia zsh (vuota su questi termini); `infra/` e `.github/workflows` su `origin/main`; README, CLAUDE.md, DESIGN.md, `app/backend`, `app/worker`, `_pipeline`, `~/spada`.
- **Strumenti pagati.** Risposta dell'utente (solo Cloudflare); Railway via MCP (un progetto, non SPADA).
- **Ecosistema Claude.** GitHub: "claude skill tauri", "claude code plugin electron".
- **Fuori**, query in inglese e generiche. GitHub via gh: tauri python sidecar, electron python fastapi, pywebview, better-auth cloudflare, tauri oauth, partykit, cloudflare actors, electron python example. Hacker News: tauri vs electron, D1 latency, durable objects billing, git LFS, sqlite sync engine, edge SaaS. Documentazione: v2.tauri.app (sidecar, windows-installer, sign macos e windows, updater, deep-linking), electronjs.org (code-signing, updates), code.claude.com (setup, headless, authentication, legal-and-compliance, tools-reference), support.claude.com (credito Agent SDK), developers.google.com (OAuth per app native, scadenza token), firebase.google.com, supabase.com (PKCE, limiti storage e realtime, prezzi, regioni), developers.cloudflare.com (R2 prezzi, limiti, presigned, credenziali temporanee; D1 limiti, prezzi, località; Durable Objects alarm, ciclo di vita, località, prezzi; Workers limiti e prezzi; Zero Trust prezzi, Google IdP, service token, validazione JWT), powersync.com, electric-sql.com, turso.tech, zero.rocicorp.dev, jazz.tools, appwrite.io, pocketbase.io, convex.dev, docs.github.com (file grandi, LFS), docs.gitlab.com, about.gitea.com. X: due post di Anthropic sull'uso delle subscription da strumenti terzi.
- **Non coperti.** Reddit: PullPush ha risposto 502 per tutto il giorno e WebSearch su reddit.com non apre i thread. Thread della community Cloudflare su Access con cloudflared (403). README di dchuk/claude-code-tauri-skills (404). Nessuna esperienza trovata su Cloudflare Access da un'app Tauri o Electron. Nessuna misura diretta del peso di un'app Electron con Python. Limiti LFS per piano GitHub. Prezzi S3 e GCS in EU letti solo da terze parti.
