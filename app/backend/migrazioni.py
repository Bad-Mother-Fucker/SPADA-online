"""Migrazione delle gare create con le sette fasi (fino a ottobre 2026)
alle otto fasi con la Fase 4 «Domande al professionista».

Prima:  1 acquisizione · 2 grafo · 3 analisi strategica (checkpoint con
        le indicazioni) · 4 criteri · 5 revisione · 6 offerta · 7 audit
Dopo:   1 · 2 · 3 analisi strategica (senza checkpoint) · 4 domande al
        professionista (gate) · 5 criteri · 6 revisione · 7 offerta · 8 audit

Cosa sposta, una volta sola per gara (`versione_fasi: 2` in fasi.json):
- le chiavi di `_state/fasi.json` e `fase_corrente`;
- i file di handoff `_state/handoff/<n>_*.json` dalla 4 in su (e il
  campo `fase` dentro);
- il numero di fase in `_state/run_log.json` e nelle tabelle `job` e
  `approvazioni` del database;
- le domande: quelle della sezione «Domande aperte» del vecchio gara
  brief e le «Domande chiave» dell'audit strategico entrano nel registro
  unico `output/07_questions/domande.json`, con le risposte già date.

Le indicazioni strategiche già approvate con la vecchia Fase 3 restano
dove la pipeline le ha scritte (memoria e handoff della Fase 3): non si
ricostruiscono nel modulo della Fase 4, che parte vuoto. Per questo, se
la vecchia Fase 3 era approvata, la nuova Fase 4 risulta completata.
"""
import json
import logging
import re
import sys
from pathlib import Path

from db import get_conn
from paths import GARE_DIR

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_pipeline" / "scripts" / "domande"))
import domande as registro  # noqa: E402

log = logging.getLogger("spada.migrazioni")

VECCHIE = ["1_acquisizione_documenti", "2_costruzione_grafo", "3_analisi_strategica",
           "4_elaborazione_criteri", "5_revisione_proposte", "6_stesura_offerta", "7_approvazione_finale"]
NUOVE = ["1_acquisizione_documenti", "2_costruzione_grafo", "3_analisi_strategica",
         "4_domande_professionista", "5_elaborazione_criteri", "6_revisione_proposte",
         "7_stesura_offerta", "8_approvazione_finale"]
NUOVA_DI = {1: 1, 2: 2, 3: 3, 4: 5, 5: 6, 6: 7, 7: 8}


def _scrivi_json(p: Path, dati):
    tmp = p.with_suffix(p.suffix + ".migrazione")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def _importa_domande_audit(gara: Path) -> int:
    p = gara / "output" / "03_criteria" / "strategy_audit.md"
    if not p.exists():
        return 0
    m = re.search(r"^## Domande chiave[^\n]*\n(.*?)(?=^## |\Z)", p.read_text(encoding="utf-8"), re.MULTILINE | re.DOTALL)
    if not m:
        return 0
    n = 0
    for riga in m.group(1).split("\n"):
        mi = re.match(r"^\s*\d+[.)]\s+(.*)$", riga)
        if mi and not mi.group(1).startswith("["):
            _, creata = registro.aggiungi(gara, "fase_3", "strategica", mi.group(1),
                                          fonte="strategy_audit.md, Domande chiave (Fase 3, versione precedente)")
            n += int(creata)
    return n


def migra_gara(gara: Path) -> bool:
    p = gara / "_state" / "fasi.json"
    try:
        fasi = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return False
    if fasi.get("versione_fasi") == 2 or "4_domande_professionista" in fasi.get("fasi", {}):
        return False

    vecchie = fasi.get("fasi", {})
    nuove = {}
    for k_vecchia in VECCHIE:
        n = int(k_vecchia.split("_")[0])
        corpo = dict(vecchie.get(k_vecchia) or {"stato": "da_eseguire", "sintesi": ""})
        nuove[NUOVE[NUOVA_DI[n] - 1]] = corpo
    f3 = nuove["3_analisi_strategica"]
    approvata = f3.get("stato") == "completata" and not f3.get("richiede_approvazione")
    # L'audit c'è: la Fase 3 non ha più un checkpoint, resta completata
    # anche se l'approvazione delle indicazioni era ancora in attesa.
    f3.pop("richiede_approvazione", None)
    nuove["4_domande_professionista"] = (
        {"stato": "completata", "sintesi": "Indicazioni strategiche approvate con la versione precedente della Fase 3.",
         "conclusa_il": f3.get("conclusa_il")} if approvata else {"stato": "da_eseguire", "sintesi": ""})
    corrente = int(fasi.get("fase_corrente") or 1)
    fasi = {"$schema": fasi.get("$schema", "../../_pipeline/schemas/fasi.schema.json"),
            "versione_fasi": 2, "fase_corrente": NUOVA_DI.get(corrente, corrente),
            "fasi": {k: nuove[k] for k in NUOVE}}

    # Handoff dalla 4 in su, dall'ultimo per non sovrascrivere.
    hdir = gara / "_state" / "handoff"
    for k_vecchia in reversed(VECCHIE[3:]):
        sorgente = hdir / f"{k_vecchia}.json"
        if sorgente.exists():
            n_nuova = NUOVA_DI[int(k_vecchia.split("_")[0])]
            destinazione = hdir / f"{NUOVE[n_nuova - 1]}.json"
            try:
                h = json.loads(sorgente.read_text(encoding="utf-8"))
                h["fase"] = n_nuova
                _scrivi_json(destinazione, h)
                sorgente.unlink()
            except Exception:
                log.exception("Handoff %s non migrato", sorgente)

    rl = gara / "_state" / "run_log.json"
    if rl.exists():
        try:
            run_log = json.loads(rl.read_text(encoding="utf-8"))
            for r in run_log.get("runs", []):
                if isinstance(r.get("fase"), int):
                    r["fase"] = NUOVA_DI.get(r["fase"], r["fase"])
            _scrivi_json(rl, run_log)
        except Exception:
            log.exception("run_log di %s non migrato", gara.name)

    # fasi.json prima del database: il +1 sulle tabelle non è idempotente,
    # e deve avvenire solo se la gara risulta migrata. Se il database
    # fallisce, resta sbagliato solo lo storico dei job (numeri di fase).
    _scrivi_json(p, fasi)
    try:
        with get_conn() as con:
            for tabella in ("job", "approvazioni"):
                con.execute(f"UPDATE {tabella} SET fase = fase + 1 WHERE gara_slug=? AND fase >= 4", (gara.name,))
    except Exception:
        log.exception("Storico job/approvazioni di %s non rinumerato", gara.name)

    try:
        n_brief = registro.importa_brief(gara)
        n_audit = _importa_domande_audit(gara)
    except Exception:
        log.exception("Domande di %s non importate nel registro", gara.name)
        n_brief = n_audit = 0
    log.info("Gara %s migrata a 8 fasi (domande importate: %d dal brief, %d dall'audit).", gara.name, n_brief, n_audit)
    return True


def migra_gare():
    if not GARE_DIR.exists():
        return
    for gara in sorted(GARE_DIR.iterdir()):
        if (gara / "manifest.json").exists():
            try:
                migra_gara(gara)
            except Exception:
                log.exception("Migrazione a 8 fasi fallita per %s", gara.name)
