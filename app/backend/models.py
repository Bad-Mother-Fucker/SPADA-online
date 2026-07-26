from typing import Literal, Optional

from pydantic import BaseModel, Field


class CreaGaraRequest(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    nome: str
    regione: str
    anno_prezzario: int = Field(ge=2000, le=2100)
    modello: str = "claude-sonnet-5"
    effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"


class ApprovazioneRequest(BaseModel):
    fase: int = Field(ge=1, le=7)
    tipo: Literal["direttive", "proposta", "offerta"]
    riferimento: Optional[str] = None
    decisione: Optional[Literal["approvata", "da_modificare", "scartata"]] = None
    nota: Optional[str] = None


class AssistenteRequest(BaseModel):
    messaggio: str
