# SPADA Online

Ricostruzione da zero, in repository nuovi, del sistema Prometeus
S.P.A.D.A. (analisi gare d'appalto e offerta tecnica) come applicazione
web con UI, backend e pipeline condivisa — invece del modello a
template clonato per gara del repo storico `prometeus-spada`.

**`prometeus-spada` resta la sola fonte di riferimento, in sola
lettura.** Non viene mai modificato, non riceve branch né commit da
questo progetto: si legge e si copia da lì, adattando. Vedi
`docs/sprint1-inventario.md` per la mappa completa di cosa è stato
portato e come.

## Struttura di questo repo

```
SPADA-online/
├── _pipeline/    agenti, skill, comandi, script, hook — condivisi da ogni gara (Sprint 1-3)
├── app/          backend FastAPI, worker, frontend (Sprint 4-9)
├── infra/        artefatti di deploy: systemd, tunnel, runbook (Sprint 9)
└── docs/         inventario, decisioni, schemi
```

Le gare vere e proprie (dati, mai codice) vivono fuori da questo repo,
in `~/spada/gare/<slug>/`, ciascuna con il proprio `.git` — vedi
struttura target nel piano e `_pipeline/scripts/setup/new_gara.sh`.

## Stato di avanzamento

| Sprint | Oggetto | Stato |
|---|---|---|
| 0 | Provisioning VM, accesso, hardening | manuale, fuori da questa sessione |
| 1 | Pipeline condivisa | **in corso in questo repo** |
| 2 | Prezzario in DB + server MCP | da fare |
| 3 | Fasi discrete, handoff, telemetria | da fare |
| 4 | Backend FastAPI | da fare |
| 5 | Design system | da fare |
| 6 | Frontend | da fare |
| 7 | Assistente di gara | da fare |
| 8 | Ingestione incrementale | da fare |
| 9 | Deploy e messa in sicurezza | da fare (in parte manuale) |

Dettaglio di ogni sprint nei rispettivi `README.md` di `_pipeline/` e
`app/`, e nel piano originale (non incluso qui: vive nella
conversazione/issue che ha originato il progetto).
