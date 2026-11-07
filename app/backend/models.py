from typing import Literal, Optional

from pydantic import BaseModel, Field


class CreaGaraRequest(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    nome: str
    regione: str
    anno_prezzario: int = Field(ge=2000, le=2100)
    modello: str = "sonnet"
    effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"


class ApprovazioneRequest(BaseModel):
    fase: int = Field(ge=1, le=8)
    tipo: Literal["direttive", "proposta", "offerta"]
    riferimento: Optional[str] = None
    decisione: Optional[Literal["approvata", "da_modificare", "scartata"]] = None
    nota: Optional[str] = None


class ImportaPrezzarioRequest(BaseModel):
    regione: str = Field(min_length=2, max_length=40)
    anno: int = Field(ge=2000, le=2100)


class PrioritaCriterio(BaseModel):
    id: str = Field(pattern=r"^C[0-9]+$")
    livello: Literal["", "ALTA", "MEDIA", "BASSA"] = ""
    indicazione: str = ""


class IndicazioniStrategiche(BaseModel):
    """Indicazioni strategiche del professionista (Fase 4): guidano la
    ricerca soluzioni (cornice delle proposte) e la stesura dell'offerta
    (priorità → budget di facciate)."""
    tono: Literal["", "conservativo", "bilanciato", "audace"] = ""
    priorita: list[PrioritaCriterio] = []
    vincoli: list[str] = []
    opportunita: list[str] = []
    note: str = ""


class BozzaDomandeRequest(BaseModel):
    """Bozza della Fase 4: risposte per id di domanda ("" = senza
    risposta) e indicazioni strategiche. Salvarla non la invia."""
    risposte: dict[str, str] = {}
    indicazioni: Optional[IndicazioniStrategiche] = None


class InformazioneProfessionistaRequest(BaseModel):
    """Un'informazione data dal professionista di sua iniziativa: entra
    nel contesto con il prossimo invio della Fase 4."""
    titolo: str = Field(min_length=1, max_length=200)
    testo: str = Field(min_length=1)
    criterio: Optional[str] = Field(default=None, pattern=r"^C[0-9]+(\.[0-9]+)?$")


class IntegraDocumentoRequest(BaseModel):
    """Documento già caricato (percorso sotto la gara, es.
    input/elaborati/X.pdf) da integrare nel contesto dopo la Fase 2."""
    percorso: str


class AssistenteRequest(BaseModel):
    messaggio: str


class AssistenteStreamRequest(BaseModel):
    messaggio: str = Field(min_length=1)
    # rapida: risposta breve dai dati già noti; approfondita: ricerca e verifiche.
    modalita: Literal["rapida", "approfondita"] = "rapida"


class ProposaOperatoreRequest(BaseModel):
    """Sprint 10.2 — proposta suggerita dal professionista in Ricerca
    soluzioni, valutata dal sistema insieme alle proprie (criterion-agent
    la legge da output/07_questions/, evidence-auditor la audita)."""
    criterio: str = Field(pattern=r"^C[0-9]+$")
    gap_id: Optional[str] = Field(default=None, pattern=r"^G-C[0-9]+-[0-9]+$")
    titolo: str
    descrizione: str


class PropostaProfessionistaRequest(BaseModel):
    """Fase 6 — proposta scritta dal professionista, approvata per
    definizione: alla conferma entra nel Cx_output.md del criterio e
    feedback-processor ne fa un nodo del grafo."""
    criterio: str = Field(pattern=r"^C[0-9]+$")
    sottocriterio: Optional[str] = Field(default=None, pattern=r"^C[0-9]+\.[0-9]+$")
    gap_id: Optional[str] = Field(default=None, pattern=r"^G-C[0-9]+-[0-9]+$")
    titolo: str = Field(min_length=3, max_length=200)
    descrizione: str = Field(min_length=10, max_length=8000)


class RichiestaModificheRequest(BaseModel):
    """Fase 7 — cosa cambiare in uno stadio di un deliverable (scaletta,
    bozza, definitivo): l'agente lo riscrive applicando la nota."""
    nota: str = Field(min_length=3, max_length=4000)


class TestoStadioRequest(BaseModel):
    """Fase 7 — testo di uno stadio modificato a mano dal professionista."""
    testo: str = Field(min_length=1, max_length=400_000)


class InterventoRequest(BaseModel):
    """Sprint 10.4 — chat a controllo pieno, scoped alla sola directory
    della gara. A differenza di AssistenteRequest (sola lettura)."""
    messaggio: str


class CodiceLoginRequest(BaseModel):
    """Codice mostrato dalla pagina di accesso di Anthropic quando il
    ritorno automatico al login non riesce."""
    codice: str = Field(min_length=1, max_length=2000)


class GraficaRequest(BaseModel):
    """Fase 7 — nuova figura della relazione per una proposta approvata:
    cosa deve mostrare, scritto dal professionista."""
    proposta_id: str = Field(pattern=r"^P-C[0-9]+-[0-9]+$")
    richiesta: str = Field(min_length=10, max_length=4000)


class AggiornaGraficaRequest(BaseModel):
    """Fase 7 — correzioni del professionista a richiesta, prompt o
    didascalia di una figura. I campi assenti restano com'erano."""
    richiesta: Optional[str] = Field(default=None, min_length=10, max_length=4000)
    prompt: Optional[str] = Field(default=None, max_length=32000)
    didascalia: Optional[str] = Field(default=None, max_length=400)
    prompt_riferimento: Optional[str] = Field(default=None, max_length=4000)
    usa_riferimento: Optional[bool] = None


class RitaglioRiferimentoRequest(BaseModel):
    """Riquadro del riferimento sulla pagina dell'elaborato, in frazioni
    (x0, y0, x1, y1; origine in alto a sinistra)."""
    riquadro: list[float] = Field(min_length=4, max_length=4)


class ImpostazioniOpenAIRequest(BaseModel):
    """Chiave API e modello per la generazione delle immagini. Un campo
    assente resta com'era."""
    chiave: Optional[str] = Field(default=None, min_length=20, max_length=400, pattern=r"^\S+$")
    modello: Optional[str] = Field(default=None, min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
