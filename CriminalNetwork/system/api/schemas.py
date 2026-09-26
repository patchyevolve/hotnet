"""Request/response models for the investigative API.

Kept deliberately thin: the pipeline's own JSON is the source of truth for
findings, so these models only describe what an investigator *submits* — a
session, a case, a FIR, an evidence file, a run request.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from api.identity import JURISDICTIONS, ROLES

InvestigationStatus = Literal[
    "UNDER_INVESTIGATION", "SUSPENDED", "CLOSED", "CHARGESHEET_FILED"
]


class SessionStart(BaseModel):
    """Sign in via the active identity provider.

    While ``CRIMENET_AUTH_PROVIDER=session`` this is a display-name picker, not
    a credential check — see ``IdentityProvider``. ``CredentialIdentityProvider``
    accepts the same payload plus credentials, so swapping the provider does
    not change this contract.
    """

    displayName: str = Field(min_length=2, max_length=80)
    role: str
    jurisdictionId: str
    credentials: dict[str, str] | None = None

    @field_validator("role")
    @classmethod
    def _role_known(cls, value: str) -> str:
        if value not in ROLES:
            raise ValueError(f"Unknown role: {value}")
        return value

    @field_validator("jurisdictionId")
    @classmethod
    def _jurisdiction_known(cls, value: str) -> str:
        if value not in JURISDICTIONS:
            raise ValueError(f"Unknown jurisdiction: {value}")
        return value


class CaseCreate(BaseModel):
    """Register a new case and its first FIR.

    ``firNumber`` is typed by the investigator exactly as it appears on paper;
    the sequential ``CASE_000001`` / ``FIR_000001`` ids are generated below.
    """

    firNumber: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=4000)
    jurisdictionId: str | None = None

    @field_validator("firNumber", "title")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class FirCreate(BaseModel):
    """Open an additional FIR under an existing case."""

    firNumber: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=4000)
    jurisdictionId: str | None = None

    @field_validator("firNumber")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class RunRequest(BaseModel):
    """Trigger a pipeline run for a case.

    ``append`` marks the run as incremental: it processes only files the
    previous run has not seen, which is exactly the "add two more evidence
    files to an existing FIR" flow.
    """

    append: bool = False
    noDatabase: bool = False


class JobView(BaseModel):
    """Serialised job state. Shape matches ``Job.to_dict``."""

    jobId: str
    caseId: str
    kind: str
    status: str
    progress: float
    stage: int
    totalStages: int
    detail: str
    stagesDone: list[str]
    fileCount: int
    requestedBy: str
    jurisdictionId: str
    createdAt: str
    startedAt: str | None = None
    finishedAt: str | None = None
    error: str | None = None
    returncode: int | None = None
    runId: str | None = None


class FaceDecision(BaseModel):
    """Investigator confirm/reject of a proposed face match.

    The pipeline proposes (doc 08 §3.2 candidates, §4.3 tiers); the
    investigator disposes. CONFIRMED / rejected are never derived from
    similarity alone — they only ever come from this payload or from an
    identity document confirmation.
    """

    faceId: str = Field(min_length=1, max_length=160)
    decision: Literal["confirm", "reject"]
    reviewer: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=500)
