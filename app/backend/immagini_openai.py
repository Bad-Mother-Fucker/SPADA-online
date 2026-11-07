"""Generazione di immagini con le API di OpenAI (grafiche della relazione).

La chiave vale per tutta l'installazione: sta in _data/openai.env
(permessi 600), accanto ad auth.env di Claude. Non torna mai al browser
se non mascherata e non finisce nei log. In assenza del file vale
OPENAI_API_KEY dell'ambiente, che dall'interfaccia non si può rimuovere.

Senza chiave il flusso resta manuale: il professionista copia il prompt
in ChatGPT e carica l'immagine.
"""
import base64
import json
import os
import urllib.error
import urllib.request

from paths import DATA_DIR

FILE_CHIAVE = DATA_DIR / "openai.env"
MODELLO_PREDEFINITO = "gpt-image-1"
URL_API = "https://api.openai.com/v1"
TIMEOUT_GENERAZIONE = 240
TIMEOUT_VERIFICA = 20
DIMENSIONE = "1536x1024"  # orizzontale 3:2, adatto alla larghezza di una pagina A4


class ErroreOpenAI(RuntimeError):
    """Errore con un messaggio leggibile dal professionista e un tipo
    che l'interfaccia usa per proporre la via d'uscita."""

    def __init__(self, tipo: str, messaggio: str):
        super().__init__(messaggio)
        self.tipo = tipo  # chiave | credito | rifiuto | rete | modello | altro


def _leggi_file() -> dict:
    out = {}
    if FILE_CHIAVE.exists():
        for riga in FILE_CHIAVE.read_text(encoding="utf-8").splitlines():
            if "=" in riga and not riga.lstrip().startswith("#"):
                k, v = riga.split("=", 1)
                out[k.strip()] = v.strip().strip('"')
    return out


def configurazione() -> dict:
    """{chiave, modello, origine}: chiave None se non configurata."""
    f = _leggi_file()
    if f.get("OPENAI_API_KEY"):
        return {"chiave": f["OPENAI_API_KEY"], "modello": f.get("OPENAI_IMAGE_MODEL") or MODELLO_PREDEFINITO,
                "origine": "impostazioni"}
    if os.environ.get("OPENAI_API_KEY"):
        return {"chiave": os.environ["OPENAI_API_KEY"],
                "modello": f.get("OPENAI_IMAGE_MODEL") or os.environ.get("OPENAI_IMAGE_MODEL") or MODELLO_PREDEFINITO,
                "origine": "ambiente"}
    return {"chiave": None, "modello": f.get("OPENAI_IMAGE_MODEL") or MODELLO_PREDEFINITO, "origine": None}


def maschera(chiave: str | None) -> str | None:
    return f"…{chiave[-4:]}" if chiave and len(chiave) > 8 else ("…" if chiave else None)


def stato() -> dict:
    c = configurazione()
    return {"configurata": bool(c["chiave"]), "chiave": maschera(c["chiave"]), "modello": c["modello"],
            "origine": c["origine"]}


def _scrivi_file(f: dict):
    voci = {k: v for k, v in f.items() if v}
    if not voci:
        FILE_CHIAVE.unlink(missing_ok=True)
        return
    FILE_CHIAVE.parent.mkdir(parents=True, exist_ok=True)
    tmp = FILE_CHIAVE.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    # Creato già con permessi 600: la chiave non è mai leggibile da altri utenti.
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write("".join(f"{k}={v}\n" for k, v in voci.items()))
    tmp.replace(FILE_CHIAVE)


def salva(chiave: str | None, modello: str | None):
    """Aggiorna chiave e/o modello; un campo None resta com'era."""
    f = _leggi_file()
    if chiave is not None:
        f["OPENAI_API_KEY"] = chiave.strip()
    if modello is not None:
        f["OPENAI_IMAGE_MODEL"] = modello.strip() or MODELLO_PREDEFINITO
    _scrivi_file(f)


def rimuovi():
    """Toglie la chiave; il modello scelto resta."""
    f = _leggi_file()
    f.pop("OPENAI_API_KEY", None)
    _scrivi_file(f)


def _richiesta(metodo: str, percorso: str, chiave: str, corpo: dict | None, timeout: int,
               file: dict[str, tuple[str, bytes, str]] | None = None) -> dict:
    """Richiesta JSON, o multipart se ci sono file ({campo: (nome, byte, tipo)})."""
    headers = {"Authorization": f"Bearer {chiave}", "User-Agent": "spada"}
    if file:
        confine = f"spada-{os.urandom(12).hex()}"
        parti = []
        for k, v in (corpo or {}).items():
            parti.append(f'--{confine}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for campo, (nome, byte, tipo) in file.items():
            parti.append(f'--{confine}\r\nContent-Disposition: form-data; name="{campo}"; filename="{nome}"\r\n'
                         f"Content-Type: {tipo}\r\n\r\n".encode() + byte + b"\r\n")
        dati = b"".join(parti) + f"--{confine}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={confine}"
    else:
        dati = json.dumps(corpo).encode() if corpo is not None else None
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{URL_API}{percorso}", data=dati, method=metodo, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            dettaglio = (json.loads(e.read() or b"{}").get("error") or {})
        except ValueError:
            dettaglio = {}
        msg = (dettaglio.get("message") or "").strip()
        codice = dettaglio.get("code") or ""
        if e.code == 401:
            raise ErroreOpenAI("chiave", "La chiave OpenAI non è valida o è stata revocata: controllala nelle Impostazioni.")
        if e.code == 429 or codice == "insufficient_quota":
            raise ErroreOpenAI("credito", "OpenAI ha rifiutato per credito esaurito o troppe richieste. Riprova più tardi, "
                                          "oppure copia il prompt e usa ChatGPT.")
        if e.code == 400 and (codice == "moderation_blocked" or "safety" in msg.lower() or "policy" in msg.lower()):
            raise ErroreOpenAI("rifiuto", f"Il prompt è stato rifiutato dai filtri di OpenAI: modificalo e riprova. ({msg[:200]})")
        if e.code in (403, 404) and percorso.startswith("/models") or (e.code in (400, 403, 404) and "model" in msg.lower()):
            raise ErroreOpenAI("modello", f"Il modello non è disponibile per questa chiave: {msg[:200] or e.code}. "
                                          "Scegline un altro nelle Impostazioni.")
        raise ErroreOpenAI("altro", f"OpenAI ha risposto con errore {e.code}: {msg[:300] or e.reason}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        motivo = getattr(e, "reason", e)
        raise ErroreOpenAI("rete", f"OpenAI non raggiungibile o troppo lento ({motivo}). Riprova.")


def verifica() -> dict:
    """Controlla che la chiave sia valida e che il modello sia disponibile.
    Non genera nulla: non costa."""
    c = configurazione()
    if not c["chiave"]:
        raise ErroreOpenAI("chiave", "Nessuna chiave OpenAI configurata.")
    _richiesta("GET", f"/models/{c['modello']}", c["chiave"], None, TIMEOUT_VERIFICA)
    return {"ok": True, "messaggio": f"Chiave valida, modello {c['modello']} disponibile."}


def genera(prompt: str, riferimento=None) -> tuple[bytes, str]:
    """Genera un'immagine dal prompt: (byte PNG, modello usato). Con un
    riferimento (Path di un PNG o JPG) usa l'endpoint di modifica, che lo
    prende come base dell'immagine."""
    c = configurazione()
    if not c["chiave"]:
        raise ErroreOpenAI("chiave", "Nessuna chiave OpenAI configurata.")
    if riferimento is not None:
        if c["modello"].startswith("dall-e"):
            raise ErroreOpenAI("modello", f"Il modello {c['modello']} non accetta un'immagine di riferimento: "
                                          "togli il riferimento o usa gpt-image-1.")
        tipo = "image/jpeg" if riferimento.suffix.lower() in (".jpg", ".jpeg") else "image/png"
        risposta = _richiesta("POST", "/images/edits", c["chiave"],
                              {"model": c["modello"], "prompt": prompt, "n": 1, "size": DIMENSIONE},
                              TIMEOUT_GENERAZIONE, {"image[]": (riferimento.name, riferimento.read_bytes(), tipo)})
    else:
        corpo = {"model": c["modello"], "prompt": prompt, "n": 1, "size": DIMENSIONE}
        if c["modello"].startswith("dall-e"):
            corpo.update(response_format="b64_json", size="1792x1024")
        risposta = _richiesta("POST", "/images/generations", c["chiave"], corpo, TIMEOUT_GENERAZIONE)
    try:
        b64 = risposta["data"][0]["b64_json"]
    except (KeyError, IndexError, TypeError):
        raise ErroreOpenAI("altro", "OpenAI non ha restituito un'immagine.")
    return base64.b64decode(b64), c["modello"]
