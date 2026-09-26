"""Input-file handling for images — RESEARCH_FACE_RECOGNITION/11_INPUT_FILE_HANDLING.md.

Two-axis classification (source_type × context_type → extraction strategy)
per doc 11 §3, plus the §5.3 confidence-boost hierarchy used when a face
candidate is corroborated by context. All helpers are pure string/OCR-text
operations — no model calls, no side effects.
"""

from __future__ import annotations

import re
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}

# Filenames that carry no identity hint (doc 11: has_context_in_filename).
_GENERIC_NAME_TOKENS = frozenset({
    "cctv", "screenshot", "screen", "shot", "photo", "img", "image", "pic",
    "picture", "frame", "still", "capture", "captures", "export", "scan",
    "scanned", "document", "doc", "surveillance", "camera", "cam", "unknown", "copy",
    "new", "final", "edit", "mobile", "whatsapp", "download", "received",
    # case-file descriptions — these name the file's role, not a person
    "evidence", "report", "case", "note", "notes", "record", "records",
    "details", "info", "file", "files",
})

_ID_MARKERS = (
    ("aadhaar", "AADHAAR"),
    ("aadhar", "AADHAAR"),
    ("passport", "PASSPORT"),
    ("licence", "DL"),
    ("license", "DL"),
    ("driving", "DL"),
    ("pan", "PAN"),
)


def is_screenshot(file_name: str) -> bool:
    name = (file_name or "").lower()
    return "screenshot" in name or "screen_shot" in name or "cctv" in name


def is_scanned_document(file_name: str, ocr_text: str = "") -> bool:
    name = (file_name or "").lower()
    if any(marker in name for marker in ("aadhaar", "aadhar", "pan_", "passport", "licence", "license")):
        return True
    # A dense page of OCR text with no screenshot markers reads as a scan (doc 11 §2.2 SD).
    return bool(ocr_text) and len(ocr_text.split()) > 80 and not is_screenshot(file_name)


def _is_context_token(token: str) -> bool:
    """False when a token is surveillance/case-file vocabulary wearing a name's
    clothes ('liftcctv' contains 'cctv' → not an identity hint)."""
    if token in _GENERIC_NAME_TOKENS:
        return True
    return any(
        len(generic) >= 4 and generic in token
        for generic in _GENERIC_NAME_TOKENS
    )


def filename_tokens(file_name: str) -> set[str]:
    """Identity-hint tokens from a filename ('51_SURVEILLANCE_Unknown_Male' →
    {'male'} generic words dropped, digits stripped)."""
    stem = Path(file_name or "").stem.lower()
    tokens = set(re.split(r"[^a-z]+", stem))
    return {
        re.sub(r"\d+$", "", token)
        for token in tokens
        if token and not _is_context_token(token) and len(re.sub(r"\d+$", "", token)) > 1
    } - {""}


def name_tokens(name: str) -> set[str]:
    return {
        re.sub(r"\d+$", "", token)
        for token in re.split(r"[^a-z]+", (name or "").lower())
        if len(token) > 1
    }


def has_context_in_filename(file_name: str) -> bool:
    return bool(filename_tokens(file_name))


def filename_name(file_name: str) -> str:
    """Name-shaped filename → display name ('suresh.jpg' → 'Suresh').

    Doc 11 §5 Priority 5 treats the filename as a weak identity hint; this
    turns a name-shaped one into the PERSON the face stage can link against
    (scored at the FILENAME_CONTEXT floor, never higher). Surveillance words,
    digit runs and 1–2 letter fragments never mint
    ('49_CCTV_Screenshot' → '', '42_CAM_KB7' → ''), and neither do identity
    documents — those names come from OCR of the document itself.
    """
    if identity_type_from_filename(file_name):
        return ""
    stem = Path(file_name or "").stem.lower()
    tokens: list[str] = []
    seen: set[str] = set()
    for token in re.split(r"[^a-z]+", stem):
        token = re.sub(r"\d+$", "", token)
        if not token or token in seen or _is_context_token(token) or len(token) < 3:
            continue
        seen.add(token)
        tokens.append(token)
    if not tokens or len(tokens) > 4:
        return ""
    return " ".join(token.capitalize() for token in tokens)


def identity_type_from_filename(file_name: str) -> str:
    """'56_Aadhaar_Rakesh_Kumar.jpg' → 'AADHAAR' ('' when not an ID document)."""
    name = (file_name or "").lower()
    for marker, id_type in _ID_MARKERS:
        if marker in name:
            return id_type
    return ""


def find_sidecar(file_name: str, all_files: list[str]) -> str:
    """Companion metadata file (doc 11 §1 A2 / SC) — matches 'X.meta.json'
    style multi-suffix names as well as plain 'X.json'."""
    stem = Path(file_name or "").stem
    if not stem:
        return ""
    for other in all_files or []:
        if other == file_name:
            continue
        candidate = Path(other)
        if candidate.name.startswith(stem + ".") and candidate.suffix.lower() in {".json", ".txt", ".meta", ".csv"}:
            return other
    return ""


def find_references_to_file(file_name: str, file_texts: dict[str, str]) -> list[str]:
    """Files whose text names this file (doc 11 §1 C1 / RB)."""
    stem = Path(file_name or "").stem
    if not stem:
        return []
    return sorted(
        other
        for other, text in (file_texts or {}).items()
        if other != file_name and text and stem in text
    )


def has_overlaid_text(ocr_text: str) -> bool:
    """Timestamp-style overlay such as '09:30:00' (doc 11 §1 OT)."""
    return bool(re.search(r"\d{2}:\d{2}:\d{2}", ocr_text or ""))


def get_extraction_methods(source_type: str, context_type: str) -> list[str]:
    """Doc 11 §3.1 mapping — always face detection for image-bearing sources."""
    methods: list[str] = []
    if source_type in {
        "STANDALONE_FILE", "SCREENSHOT", "IDENTITY_DOCUMENT",
        "PHOTO_OF_PERSON", "EXTERNAL_FEED",
    }:
        methods.append("face_detection")
    if source_type in {"DOCUMENT_EMBEDDED", "SCAN_OF_DOCUMENT", "SCREENSHOT"}:
        methods.append("ocr_extraction")
    if source_type == "IDENTITY_DOCUMENT":
        methods.extend(["identity_extraction", "face_extraction"])
    if source_type == "SCREENSHOT":
        methods.append("text_face_association")
    if source_type == "DOCUMENT_EMBEDDED":
        methods.extend(["embedded_image_extraction", "text_extraction"])
    if context_type == "SIDECAR_FILE":
        methods.append("sidecar_parsing")
    elif context_type == "DOCUMENT_CONTEXT":
        methods.append("document_context_extraction")
    elif context_type == "OVERLAID_TEXT":
        methods.append("overlaid_text_extraction")
    elif context_type == "REFERENCED_BY":
        methods.append("reference_context_extraction")
    return methods


def classify_image_input(
    file_path: str,
    all_files_in_folder: list[str] | None = None,
    ocr_text: str = "",
    file_texts: dict[str, str] | None = None,
) -> dict:
    """Two-axis classification (doc 11 §3.1) → processing strategy."""
    file_name = Path(file_path or "").name
    all_files = all_files_in_folder or []

    # Axis 1 — source type (§2.2)
    if is_scanned_document(file_name, ocr_text):
        source_type = "SCAN_OF_DOCUMENT"
    elif is_screenshot(file_name):
        source_type = "SCREENSHOT"
    elif identity_type_from_filename(file_name):
        source_type = "IDENTITY_DOCUMENT"
    else:
        source_type = "STANDALONE_FILE"

    # Axis 2 — context type (§2.3), priority order per §3.1
    sidecar = find_sidecar(file_name, all_files)
    references = find_references_to_file(file_name, file_texts)
    if sidecar:
        context_type, context_sources = "SIDECAR_FILE", [sidecar]
    elif has_context_in_filename(file_name):
        context_type, context_sources = "FILENAME_CONTEXT", []
    elif references:
        context_type, context_sources = "REFERENCED_BY", references
    elif has_overlaid_text(ocr_text):
        context_type, context_sources = "OVERLAID_TEXT", []
    else:
        context_type, context_sources = "NO_CONTEXT", []

    return {
        "source_type": source_type,
        "context_type": context_type,
        "context_sources": context_sources,
        "extraction_methods": get_extraction_methods(source_type, context_type),
    }


# Doc 11 §5.1 — context priority floors.
CONTEXT_CONFIDENCE_FLOOR = {
    "IDENTITY_DOCUMENT": 0.95,
    "EXTERNAL_FEED": 0.85,
    "DOCUMENT_CONTEXT": 0.75,
    "SIDECAR_FILE": 0.75,
    "REFERENCED_BY": 0.60,
    "OVERLAID_TEXT": 0.65,
    "FILENAME_CONTEXT": 0.55,
    "NO_CONTEXT": 0.50,
}


def match_face_with_context(base_confidence: float, context: dict) -> float:
    """Context boost hierarchy (doc 11 §5.3 — multipliers verbatim, capped at 1.0)."""
    boost = 1.0
    if context.get("id_type"):
        boost *= 1.5
    elif context.get("source_type") in {"EXTERNAL_FEED", "SIM_REGISTRATION", "MUGSHOT"}:
        boost *= 1.3
    elif context.get("investigator_named"):
        boost *= 1.2
    if context.get("timestamp"):
        boost *= 1.1
    return min(base_confidence * boost, 1.0)
