#!/usr/bin/env python3
"""primus_dcf.py — converte un prezzario regionale in formato ACCA PriMus
(.dcf) nei due JSON del contratto prometeus-prezzari (articoli + analisi),
pronti per import_prezzario.py.

Perché esiste: molte regioni pubblicano il prezzario anche (o solo) come
file PriMus. Convertirlo negli stessi JSON di prometeus-prezzari lascia
import_prezzario.py unico punto d'ingresso nel database, con le sue
validazioni: qui si traduce il formato, non si scrive in spada.db.

Il .dcf è un piccolo file system a pagine (4096 byte, intestazione di
0x118 byte, 0x20 byte di intestazione per pagina) che contiene file XML
compressi a blocchi zlib (contenitore "AACS"):
  CollectionEP.xml   elenco prezzi, un <ItemEP> per voce
  DatiGenerali.xml   titolo, delibera, capitoli (ItemSpCap/ItemCap/ItemSbCap)
Il formato non è documentato da ACCA: la lettura è verificata sul file
Campania 2026, confrontato voce per voce con l'edizione importata dai
JSON di prometeus-prezzari (prezzi, unità di misura, incidenze identici).

Mappatura di <ItemEP>:
  Trf                → codice_completo (così com'è, prefissi regionali compresi)
  DesEst             → articolo (descrizione estesa, spazi normalizzati)
  DesRid             → voce (descrizione ridotta di PriMus)
  IdSpCap / IdCap    → tipologia_famiglia / capitolo (+ IdSbCap se presente)
  UnMsr              → unita_misura
  Prz1               → prezzo (0 = nessun prezzo pubblicato → null)
  MDOInc, SICInc (%) → manodopera_diretta_incidenza, oneri_sicurezza_incidenza_su_prezzo (frazione)
PriMus non riporta prezzo senza S.G./U.I. né le relative quote: quei
campi restano null. Anche l'importo della manodopera resta null: PriMus
ne dà solo l'incidenza arrotondata al centesimo di punto, e prezzo ×
incidenza sbaglierebbe di qualche centesimo (verificato su Campania 2026). Le voci senza codice (avvertenze) non sono voci di
prezzario e vengono saltate. Un codice ripetuto nella fonte (errore
dell'edizione) non viene attribuito a una sola delle voci: ciascuna
riceve il suffisso " (i/n)", così una ricerca per codice esatto non
restituisce un prezzo a caso fra quelli omonimi.

Uso:
  python3 primus_dcf.py LisBasilicata_OOPP_2025.dcf \\
    --regione Basilicata --anno 2025 --out /tmp/cartella

Scrive prezzario_<regione>_<anno>.json e prezzario_<regione>_analisi_<anno>.json
(nomi attesi da import_prezzario.sh). Esce non-zero se il file non è un
PriMus leggibile o se l'anno dichiarato nel file non è quello indicato.
"""
import argparse
import json
import re
import struct
import sys
import zlib
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

FIRMA = b"AAMVHFSS"
BASE = 0x118                 # le pagine iniziano dopo l'intestazione del contenitore
PAGINA = 0x1000
INTESTAZIONE_PAGINA = 0x20
CARICO_PAGINA = PAGINA - INTESTAZIONE_PAGINA
SLOT_DIRECTORY = 0x200       # voci di directory: slot di 0x200 byte dall'inizio delle pagine,
NOME_IN_SLOT = 0x100         # col nome a metà slot
CAMPI_DA_NOME = 0xE0         # e i campi (prima pagina, dimensione) 0xE0 byte prima del nome
NESSUNA_PAGINA = 0xFFFFFFFF


class FormatoNonValido(ValueError):
    pass


def _u32(buf, off):
    return struct.unpack_from("<I", buf, off)[0]


def _leggi_file(data: bytes, nome: str) -> bytes:
    """Contenuto (ancora compresso) di un file del contenitore."""
    pagine_totali = (len(data) - BASE) // PAGINA
    for m in re.finditer(re.escape(nome.encode() + b"\0"), data):
        off = m.start()
        if off < BASE + CAMPI_DA_NOME or (off - BASE) % SLOT_DIRECTORY != NOME_IN_SLOT:
            continue
        prima, dim = struct.unpack_from("<II", data, off - CAMPI_DA_NOME)
        if prima == NESSUNA_PAGINA or dim == 0 or prima >= pagine_totali:
            continue
        mappa = BASE + prima * PAGINA
        n = -(-dim // CARICO_PAGINA)
        # La mappa delle pagine sta in una sola pagina (fino a ~4 MB
        # compressi). Oltre servirebbe la mappa a più livelli, mai vista
        # nei prezzari regionali: meglio fermarsi che leggere a metà.
        if _u32(data, mappa) != NESSUNA_PAGINA or n > CARICO_PAGINA // 4:
            raise FormatoNonValido(f"{nome}: mappa delle pagine su più livelli, non supportata.")
        pagine = struct.unpack_from(f"<{n}I", data, mappa + INTESTAZIONE_PAGINA)
        if any(p >= pagine_totali for p in pagine):
            raise FormatoNonValido(f"{nome}: la mappa punta oltre la fine del file.")
        return b"".join(
            data[BASE + p * PAGINA + INTESTAZIONE_PAGINA:BASE + (p + 1) * PAGINA] for p in pagine
        )[:dim]
    raise FormatoNonValido(f"{nome} non trovato nel contenitore.")


def _decomprimi(buf: bytes, nome: str) -> bytes:
    """Contenitore AACS: intestazione di 0x80 byte, poi blocchi zlib
    preceduti da (dimensione compressa, dimensione, controllo, fine)."""
    if buf[:4] != b"AACS":
        raise FormatoNonValido(f"{nome}: contenitore compresso non riconosciuto.")
    blocchi, off, parti = _u32(buf, 0x0C), 0x80, []
    for i in range(blocchi):
        compressa, attesa, _controllo, fine = struct.unpack_from("<4I", buf, off)
        try:
            parte = zlib.decompress(buf[off + 16:off + 16 + compressa])
        except zlib.error as e:
            raise FormatoNonValido(f"{nome}: blocco {i} corrotto ({e}).")
        if len(parte) != attesa:
            raise FormatoNonValido(f"{nome}: blocco {i} di {len(parte)} byte invece di {attesa}.")
        parti.append(parte)
        off = fine
    if off != len(buf):
        raise FormatoNonValido(f"{nome}: {len(buf) - off} byte non letti dopo l'ultimo blocco.")
    return b"".join(parti)


def leggi_xml(path: Path, nome: str) -> ET.Element:
    data = path.read_bytes()
    if data[:len(FIRMA)] != FIRMA:
        raise FormatoNonValido(f"{path.name} non è un file PriMus (.dcf).")
    return ET.fromstring(_decomprimi(_leggi_file(data, nome), nome))


def _testo(s):
    s = " ".join((s or "").split())
    return s or None


def _numero(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def converti(path: Path, regione: str, anno: int):
    """Ritorna (articoli_json, analisi_json, avvisi)."""
    dati = leggi_xml(path, "DatiGenerali.xml")
    elenco = leggi_xml(path, "CollectionEP.xml")
    avvisi = []

    generali = dati.find("DGDatiGenerali")
    titolo = _testo(generali.get("DsTrf")) if generali is not None else None
    oggetto = _testo(generali.get("Ogg")) if generali is not None else None
    if not titolo:
        raise FormatoNonValido("titolo del prezzario (DsTrf) assente nei dati generali.")
    anni = {int(a) for a in re.findall(r"\b(20\d\d)\b", titolo)}
    if anni and anno not in anni:
        raise FormatoNonValido(
            f"il file è «{titolo}», non l'edizione {anno}. Importalo con l'anno giusto "
            f"({', '.join(map(str, sorted(anni)))}): un'edizione etichettata con l'anno "
            "sbagliato verrebbe usata per gare a cui non si applica."
        )
    if regione.lower() not in titolo.lower():
        avvisi.append(f"il titolo del file («{titolo}») non nomina la regione {regione}: verifica che sia il file giusto.")

    # "Data Pubb. (ACCA): [13-05-2025] - Rev.: 0  D.G.R. n.208 del 17-04-2025"
    pubblicazione, riferimento = None, oggetto
    m = re.match(r"Data Pubb.*?\[([^\]]+)\].*?Rev\.?:?\s*\d+\s*(.*)$", oggetto or "")
    if m:
        pubblicazione, riferimento = m.group(1), _testo(m.group(2))

    def capitoli(tag):
        return {c.get("Id"): _testo(c.get("DesSnt")) for c in dati.iter(tag) if c.get("Id") != "0"}
    super_capitoli, cap, sotto_cap = capitoli("ItemSpCap"), capitoli("ItemCap"), capitoli("ItemSbCap")

    if elenco.get("IsIncAnls") == "true":
        avvisi.append("il file contiene anche le analisi prezzi: questa conversione importa solo l'elenco prezzi.")

    voci_ep = [it for it in elenco.iter("ItemEP") if (it.get("Trf") or "").strip()]
    saltate = sum(1 for _ in elenco.iter("ItemEP")) - len(voci_ep)
    ripetuti = {c: n for c, n in Counter(it.get("Trf").strip() for it in voci_ep).items() if n > 1}
    visti = Counter()

    voci = {}
    for it in voci_ep:
        codice = it.get("Trf").strip()
        if codice in ripetuti:
            visti[codice] += 1
            codice = f"{codice} ({visti[codice]}/{ripetuti[codice]})"
        prezzo = _numero(it.get("Prz1")) or None
        mdo = _numero(it.get("MDOInc")) / 100 or None
        sic = _numero(it.get("SICInc")) / 100 or None
        capitolo = cap.get(it.get("IdCap"))
        if sotto_cap.get(it.get("IdSbCap")):
            capitolo = " — ".join(x for x in (capitolo, sotto_cap[it.get("IdSbCap")]) if x)
        voci[codice] = {
            "tipologia_famiglia": super_capitoli.get(it.get("IdSpCap")),
            "capitolo": capitolo,
            "voce": _testo(it.get("DesRid")),
            "articolo": _testo(it.get("DesEst")),
            "unita_misura": _testo(it.get("UnMsr")),
            "prezzo_base": None,
            "prezzo": prezzo,
            "manodopera_diretta_incidenza": round(mdo, 6) if mdo else None,
            "oneri_sicurezza_incidenza_su_prezzo": round(sic, 6) if sic else None,
        }

    if ripetuti:
        avvisi.append(
            "codici ripetuti nella fonte, importati con suffisso (i/n): "
            + ", ".join(f"{c} ×{n}" for c, n in sorted(ripetuti.items()))
        )
    senza_prezzo = sum(1 for v in voci.values() if v["prezzo"] is None)
    if senza_prezzo:
        avvisi.append(f"{senza_prezzo} voci senza prezzo pubblicato (es. sovrapprezzi in percentuale): prezzo null.")
    if saltate:
        avvisi.append(f"{saltate} voci senza codice (avvertenze, note) saltate.")

    fonte = titolo + (f" — file PriMus ACCA pubblicato il {pubblicazione}" if pubblicazione else " — file PriMus ACCA")
    metadata = {
        "fonte": fonte,
        "riferimento_normativo": riferimento,
        "vigenza": None,
        "formato_sorgente": "primus_dcf",
        "file_sorgente": path.name,
    }
    return {"metadata": metadata, "voci": voci}, {"metadata": metadata, "analisi": {}}, avvisi


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dcf", type=Path)
    ap.add_argument("--regione", required=True)
    ap.add_argument("--anno", required=True, type=int)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    if not args.dcf.is_file():
        sys.exit(f"✗ File non trovato: {args.dcf}")
    print(f"▶ Converto {args.dcf.name} (PriMus) nel formato prometeus-prezzari")
    try:
        articoli, analisi, avvisi = converti(args.dcf, args.regione, args.anno)
    except FormatoNonValido as e:
        sys.exit(f"✗ {e}")
    for a in avvisi:
        print(f"  ! {a}")

    args.out.mkdir(parents=True, exist_ok=True)
    r = args.regione.lower()
    (args.out / f"prezzario_{r}_{args.anno}.json").write_text(
        json.dumps(articoli, ensure_ascii=False), encoding="utf-8")
    (args.out / f"prezzario_{r}_analisi_{args.anno}.json").write_text(
        json.dumps(analisi, ensure_ascii=False), encoding="utf-8")
    m = articoli["metadata"]
    print(f"  ✓ {len(articoli['voci'])} voci — {m['fonte']}")
    if m["riferimento_normativo"]:
        print(f"  ✓ {m['riferimento_normativo']}")


if __name__ == "__main__":
    main()
