# STAGE 1: INGESTION ENGINE — Architecture & Implementation

## Overview
Stage 1 is the entry point for all evidence into the system. It handles file detection, parsing, validation, normalization, and metadata creation. Every file entering the system gets a full audit trail from the start.

**Note:** `PoliceStation` has been replaced by `JurisdictionNode`. All references to police stations now use `jurisdiction_node_id` pointing to a `JurisdictionNode` entity.

**Note:** Stage 1 is responsible for creating `Case` and `FIR` entities during ingestion. Each `Case` gets a `jurisdiction_node_id`, and each `FIR` gets both a `case_id` and a `jurisdiction_node_id`.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STAGE 1: INGESTION ENGINE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │  Input Dir   │───▶│ File Scanner │───▶│ Filter Check │───▶│ Evidence │  │
│  │  (demo_data) │    │              │    │ (.md,.zip→skip)│   │  Files   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └────┬─────┘  │
│                                                                   │        │
│                                                                   ▼        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    PER FILE PROCESSING                              │   │
│  │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────┐  │   │
│  │  │   Parse    │──▶│  Detect    │──▶│  Create    │──▶│  Create   │  │   │
│  │  │  (CSV/JSON │   │  Source    │   │  Evidence  │   │  Dependency│  │   │
│  │  │   /TXT)    │   │  Type      │   │  Integrity │   │  Group    │  │   │
│  │  └────────────┘   └────────────┘   └────────────┘   └───────────┘  │   │
│  │                                                                     │   │
│  │  ┌────────────────────────────────────────────────────────────────┐  │   │
│  │  │              QUALITY & ADVERSARIAL CHECKS                     │  │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │   │
│  │  │  │ Data Quality │  │ Completeness │  │ Adversarial Data   │  │  │   │
│  │  │  │   Scoring    │  │  Assessment  │  │     Check          │  │  │   │
│  │  │  └──────────────┘  └──────────────┘  └────────────────────┘  │  │   │
│  │  └────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      OUTPUTS                                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │   │
│  │  │ RawEvidence  │  │ EvidenceInteg│  │ DependencyGrp│  │ Pipeline│ │   │
│  │  │    []        │  │    []        │  │    []        │  │   Run   │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │   │
│  │  ┌──────────────┐  ┌──────────────┐                                │   │
│  │  │ DataQuality  │  │ Adversarial  │                                │   │
│  │  │   Score[]    │  │  Check[]     │                                │   │
│  │  └──────────────┘  └──────────────┘                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
                    ┌─────────────────────────────────────┐
                    │           INPUT FILES                │
                    │  01_FIR.txt, 02_CDR_Rakesh.csv,    │
                    │  05_Bank_Rakesh.csv, 08_Device.json │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     FILE TYPE DETECTION              │
                    │  CSV → pandas read_csv               │
                    │  JSON → json.load                    │
                    │  TXT → read text                     │
                    │  PDF → pdfplumber + OCR fallback     │
                    │  Images → Tesseract OCR (HIN+ENG)    │
                    │  DOCX → python-docx                  │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  Source Type    │  │  File Hash      │  │  Column         │
    │  Detection      │  │  (SHA-256)      │  │  Mapping        │
    │  (filename pat) │  │                 │  │  (pattern+LLM)  │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     EVIDENCE INTEGRITY             │
                    │  chain_of_custody:                 │
                    │    action: "ingested"              │
                    │    timestamp: ISO 8601             │
                    │    by: "ingestion_engine"          │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     DATA QUALITY SCORING           │
                    │  quality_score: 0.0-1.0            │
                    │  completeness_score: 0.0-1.0       │
                    │  structural_consistency: 0.0-1.0   │
                    │  content_richness: 0.0-1.0         │
                    │  issues: [empty_ratio, ...]        │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     ADVERSARIAL DATA CHECK         │
                    │  file_size_anomaly: bool           │
                    │  content_source_mismatch: bool     │
                    │  duplicate_content: bool           │
                    │  temporal_anomaly: bool            │
                    │  score: 0.0-1.0 (0=clean)         │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     DEPENDENCY GROUPING            │
                    │  same_file / same_fir /            │
                    │  same_source_type / independent    │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     RAW EVIDENCE OUTPUT            │
                    │  id, source_type, file_name,       │
                    │  file_hash, records, reliability,  │
                    │  data_quality, adversarial_check   │
                    └───────────────────────────────────┘
```

---

## Pipeline Run Versioning

Every pipeline execution creates a `PipelineRun` — a discrete, versioned record of what happened.

```python
PipelineRun {
    run_id:            "run_20260828_174951"
    case_id:           "CASE_001"
    input_snapshot:    ["01_FIR.txt", "02_CDR_Rakesh.csv", ...]
    pipeline_version:  "v1.0"
    model_versions:    {}
    policy_version:    "policy_v1.0"
    start_time:        "2026-08-28T17:49:51.630085"
    end_time:          "2026-08-28T17:49:51.947389"
    parent_run_id:     null  // null for first run, previous run ID for re-runs
    trigger:           "new_evidence"
    status:            "completed"
}
```

### Run Triggers
- New evidence added to case
- Evidence corrected/updated
- Policy changed (thresholds adjusted)
- Model retrained (new version)
- Manual reprocessing requested

---

## Source Type Detection

Files are classified by source type based on filename patterns:

| Pattern | Source Type | Reliability (occurrence) |
|---------|-------------|-------------------------|
| FIR, fir, complaint | `fir` | 0.80 |
| CDR, cdr, call_detail | `cdr` | 0.95 |
| bank, transaction, account | `bank` | 0.98 |
| CCTV, cctv, camera | `cctv` | 0.90 |
| social, instagram, facebook | `social` | 0.85 |
| device, phone_extract | `device` | 0.95 |
| report, statement, witness | `text` | 0.70 |

---

## Source Reliability Matrix

Different source types have different reliability for different claim types. This is the core of the Evidence Model.

```python
SOURCE_RELIABILITY_MATRIX = {
    "cdr": {
        "occurrence": 0.95,    # CDR reliably records that a call happened
        "identity": 0.60,      # Phone owner ≠ caller (SIM sharing)
        "location": 0.80,      # Tower-based, not GPS
        "timing": 0.95,        # Network timestamps are reliable
        "duration": 0.95,      # Network-recorded
        "intent": 0.30,        # Cannot infer intent from CDR
    },
    "bank": {
        "occurrence": 0.98,    # Bank records are authoritative
        "identity": 0.85,      # Account holder name is usually correct
        "location": 0.40,      # Branch location ≠ transaction location
        "timing": 0.95,        # Bank timestamps are reliable
        "duration": 0.0,       # N/A
        "intent": 0.50,        # Description field gives partial intent
    },
    "fir": {
        "occurrence": 0.80,    # FIR describes alleged events
        "identity": 0.70,      # Names may be misspelled
        "location": 0.75,      # Addresses in FIR are usually correct
        "timing": 0.70,        # Dates may be approximate
        "duration": 0.40,      # Rarely precise
        "intent": 0.60,        # Describes alleged intent
    },
    "cctv": {
        "occurrence": 0.90,    # CCTV captures what happened
        "identity": 0.50,      # Face recognition uncertain
        "location": 0.95,      # Camera location is fixed
        "timing": 0.90,        # Timestamp usually reliable
        "duration": 0.85,      # Can measure duration
        "intent": 0.20,        # Cannot infer intent
    },
    "social": {
        "occurrence": 0.85,    # Posts are real
        "identity": 0.60,      # Profile name ≠ real name
        "location": 0.70,      # Tagged location may be inaccurate
        "timing": 0.80,        # Post date is usually correct
        "duration": 0.0,       # N/A
        "intent": 0.50,        # Caption gives partial intent
    },
    "device": {
        "occurrence": 0.95,    # Device extraction is direct
        "identity": 0.90,      # Device owner is usually known
        "location": 0.85,      # GPS/exif data
        "timing": 0.90,        # Device timestamps
        "duration": 0.80,      # App usage duration
        "intent": 0.40,        # App usage ≠ intent
    },
    "text": {
        "occurrence": 0.70,    # Text reports describe events
        "identity": 0.65,      # Names may be approximate
        "location": 0.70,      # Addresses in text
        "timing": 0.65,        # Dates may be approximate
        "duration": 0.40,      # Rarely precise
        "intent": 0.50,        # Reporter's interpretation
    },
}
```

### Why This Matters

**Phone number reliability:**
- CDR says person X called person Y → occurrence=0.95 (call happened)
- But identity=0.60 (X might not be the SIM owner)
- So: "The call happened" is reliable, "Rakesh made the call" is less reliable

**Bank transaction reliability:**
- Bank says Rs. 50,000 transferred → occurrence=0.98 (transaction happened)
- But location=0.40 (branch location ≠ where the person was)
- So: "Money moved" is reliable, "Rakesh was at the branch" is less reliable

---

## Evidence Integrity

Every file gets a chain of custody record:

```python
EvidenceIntegrity {
    file_hash:          "sha256:51120d879626b21e..."
    original_filename:  "01_FIR.txt"
    ingestion_time:     "2026-08-28T17:49:51"
    chain_of_custody: [
        {
            action: "ingested",
            timestamp: "2026-08-28T17:49:51",
            by: "ingestion_engine",
            hash_before: "",
            hash_after: ""
        }
    ]
    transformations: []  // Populated if file is transformed (OCR, encoding fix, etc.)
}
```

### Transformation Tracking
If a file is transformed during ingestion (e.g., OCR, encoding fix), the transformation is recorded:
```python
transformations: [
    {
        type: "encoding_fix",
        input_hash: "sha256:abc123",
        output_hash: "sha256:def456",
        timestamp: "2026-08-28T17:49:52"
    }
]
```

---

## Dependency Groups

Files that share sub-sources are grouped together. This prevents double-counting evidence.

```python
DependencyGroup {
    group_id:           "grp_cdr_0"
    sources:            ["02_CDR_Rakesh.csv", "03_CDR_Suresh.csv", ...]
    dependency_type:    "same_source_type"
    description:        "Multiple cdr files may share sub-sources"
}
```

### Dependency Types
- `same_file`: Different claims from the same file (e.g., FIR witness ≠ FIR officer)
- `same_fir`: Different files derived from the same FIR
- `same_source_type`: Multiple files of the same type (may share sub-sources)
- `independent`: Files from completely different sources

---

## RawEvidence Output

Every ingested file produces a RawEvidence record:

```python
RawEvidence {
    id:                 "raw_001"
    source_type:        "fir"
    file_name:          "01_FIR.txt"
    file_hash:          "sha256:51120d879626b21e..."
    parsed_text:        "FIR No: 1234/2024..."
    structured_data:    { /* parsed fields */ }
    language:           "en"
    confidence:         0.95
    reliability:        {
        occurrence: 0.80,
        identity: 0.70,
        intent: 0.60,
        location: 0.75,
        timing: 0.70
    }
    timestamp:          "2026-08-28T17:49:51"
    evidence_integrity: { /* EvidenceIntegrity record */ }
}
```

---

## Data Quality Scoring

Every ingested file gets a quality assessment. This feeds into Stage 10 (Critic) for confidence auditing.

```python
DataQualityScore {
    file_name:              "02_CDR_Rakesh.csv"
    quality_score:          0.993     # Composite: structural_consistency × 0.5 + content_richness × 0.5
    completeness_score:     0.95      # Ratio of non-empty meaningful fields
    structural_consistency: 1.0       # Column uniformity, encoding issues, row count
    content_richness:       0.98      # Non-empty fields ratio (excludes null/None/N/A)
    issues:                 []        # ["high_empty_ratio_60%", "very_few_rows", "empty_text"]
    run_id:                 "run_20260829_152337"
}
```

### Quality Assessment Rules

| Check | Condition | Score Impact |
|-------|-----------|-------------|
| No column headers | `columns == []` | -0.3 |
| Empty dataset | `rows == []` | -0.5 |
| Very few rows | `len(rows) < 3` | -0.1 |
| High empty ratio | `>50% cells empty` | -0.3 |
| Moderate empty ratio | `>20% cells empty` | -0.1 |
| Empty text | `text.strip() == ""` | -0.7 |
| Very short text | `len(text) < 20` | -0.4 |
| Null JSON data | `data is None` | -0.7 |

### Content Richness

For tabular data: `meaningful_cells / total_cells`
- Meaningful = non-empty AND not in {null, None, N/A, na, -, ""}

For text/PDF/DOCX: `min(1.0, word_count / 50)`

---

## Completeness Assessment

Completeness measures how much of the expected data is present. For tabular data, this equals content_richness. For text, it's based on word count.

```python
# Completeness is integrated into DataQualityScore
completeness_score = content_richness  # For tabular
completeness_score = min(1.0, words / 50)  # For text
```

---

## Adversarial Data Check

Every file is checked for adversarial patterns — planted data, behavioral anomalies, and integrity issues.

```python
AdversarialCheck {
    file_name:              "07_Bank_Amit.csv"
    is_suspicious:          true
    behavioral_anomaly:     false     # Unusual patterns for source type
    temporal_anomaly:       false     # Timestamps outside expected range
    content_anomaly:        true      # Content/source type mismatch
    duplicate_suspect:      false     # Near-duplicate content from different sources
    score:                  0.3       # 0.0 = clean, 1.0 = highly suspicious
    reasons:                ["tabular_content_for_fir_source"]
    run_id:                 "run_20260829_152337"
}
```

### Check Rules

| Check | Condition | Score | Reason |
|-------|-----------|-------|--------|
| File size too small | `< source_type_min` | +0.2 | `file_size_anomaly` |
| File size too large | `> source_type_max` | +0.15 | `file_size_large` |
| Content/source mismatch | Tabular data for FIR source | +0.1 | `tabular_content_for_fir_source` |
| All rows identical | Every row same as first | +0.4 | `all_rows_identical` |
| High row duplication | `>80% rows identical` | +0.2 | `high_row_duplication` |
| Future date detected | Year > 2030 | +0.15 | `future_date_detected` |
| Very old date | Year < 1990 | +0.1 | `very_old_date` |
| Unusual Unicode | `>10 chars > U+FFFF` | +0.1 | `unusual_unicode_chars` |

### Source Type Size Thresholds

| Source Type | Min Size | Max Size |
|-------------|----------|----------|
| `cdr` | 500B | 50MB |
| `bank` | 500B | 50MB |
| `fir` | 1KB | 10MB |
| `cctv` | 100B | 50MB |
| `social` | 200B | 10MB |
| `device` | 500B | 50MB |
| `text` | 100B | 5MB |

### Adversarial Score Threshold

```
score > 0.3 → is_suspicious = true
score ≤ 0.3 → is_suspicious = false
```

Suspicious files are flagged in the pipeline output and fed to Stage 10 (Critic) for deeper analysis.

---

## File Type Support

| Extension | Parser | Output Format |
|-----------|--------|---------------|
| `.csv` | CSV DictReader | `{columns, rows}` |
| `.xlsx`/`.xls` | openpyxl | `{columns, rows}` |
| `.json` | json.load | `{data, data_type}` |
| `.txt`/`.md` | UTF-8 read | `{content, line_count}` |
| `.pdf` | pdfplumber + OCR fallback | `{content, tables, ocr_applied}` |
| `.docx` | python-docx | `{content, tables}` |
| `.jpg`/`.jpeg`/`.png` | Tesseract OCR (HIN+ENG) | `{ocr_text, quality_score, requires_vision_model}` |

### Encoding Fallback
CSV and text files try multiple encodings: UTF-8 → Latin-1 → CP1252 → UTF-16

### OCR Pipeline (Images + Scanned PDFs)
1. Open image with Pillow
2. Resize large images (max 2000px wide)
3. Run Tesseract OCR with `hin+eng` language data
4. Calculate quality gate: word_count × 0.4 + confidence × 0.35 + alphanum_ratio × 0.25
5. If quality_score > 0.3 AND meaningful_words ≥ 2 → use OCR text
6. Otherwise → flag `requires_vision_model: true`

### Scanned PDF Fallback
If pdfplumber extracts < 20 chars of text:
1. Convert each page to image via PyMuPDF (2x resolution)
2. Run Tesseract OCR on each page image
3. Combine OCR text from all pages

---

## Files Skipped

The following are not treated as evidence:
- `.md`, `.zip`, `.tar`, `.gz`, `.env`, `.py`, `.js` extensions
- `ai_providers.json`, `pipeline.json`, `extraction_output.json`, etc.
- Any file in `SKIP_FILENAMES` or `SKIP_EXTENSIONS`

---

## Case and FIR Creation During Ingestion

During ingestion, Stage 1 creates `Case` and `FIR` entities:

```python
Case {
    id:                 "CASE_001"
    case_id:            "CASE_001"
    jurisdiction_node_id: "JN_abc123"     # Points to JurisdictionNode
    fir_numbers:        ["FIR_001", "FIR_002"]
    status:             "active"
    created_at:         "2026-08-28T17:49:51"
}

FIR {
    id:                 "FIR_001"
    fir_number:         "FIR_001"
    case_id:            "CASE_001"         # Links FIR to Case
    jurisdiction_node_id: "JN_abc123"     # Points to JurisdictionNode
    source_file:        "01_FIR.txt"
    created_at:         "2026-08-28T17:49:51"
}
```

### UnresolvedJurisdiction

When the FIR parser cannot match a station name to an existing `JurisdictionNode`, an `UnresolvedJurisdiction` entity is created:

```python
UnresolvedJurisdiction {
    id:                 "UJ_abc123"
    raw_station_name:   "PS Kotwali"
    source_file:        "01_FIR.txt"
    reason:             "no_match_in_jurisdiction_db"
    created_at:         "2026-08-28T17:49:51"
}
```

This ensures no jurisdiction information is silently dropped — unresolvable station names are preserved for manual review.

---

## Implementation

### Files
- `system/src/ingestion/engine.py` — Main ingestion engine
- `system/src/ingestion/column_mapper.py` — Column name mapping
- `system/src/models/schema.py` — PipelineRun, EvidenceIntegrity, DependencyGroup, DataQualityScore, AdversarialCheck

### Key Functions
- `IngestionEngine.start_run(case_id)` — Create PipelineRun scoped to a case
- `IngestionEngine.ingest(case_id, files)` — Ingest files into a case, create Case and FIR entities
- `IngestionEngine.ingest_file(case_id, file)` — Ingest single file with full metadata
- `IngestionEngine.ingest_directory(case_id, dir_path)` — Ingest all files in directory for a case
- `IngestionEngine._assess_data_quality()` — Compute quality_score, completeness_score, structural_consistency, content_richness
- `IngestionEngine._check_adversarial()` — Detect adversarial patterns (size, content mismatch, duplicates, temporal anomalies)
- `IngestionEngine._parse_image()` — OCR with Tesseract (Hindi + English), quality gate
- `IngestionEngine._ocr_pdf()` — Scanned PDF fallback via PyMuPDF → image → Tesseract
- `detect_source_type()` — Classify file by filename patterns
- `compute_file_hash()` — SHA-256 hash
- `get_reliability()` — Lookup from SourceReliabilityMatrix

### Output Files
- `output/extraction_summary.json` — PipelineRun, ingestion summary (incl. data_quality, adversarial), dependency groups, integrity records
- `output/extraction_output.json` — Entities and relations with source_id, epistemic_category, derivation_depth, run_id

### Output Fields Added
- `file_info["data_quality"]` — DataQualityScore dict per file
- `file_info["adversarial_check"]` — AdversarialCheck dict per file
- `ingestion_summary["data_quality"]` — Aggregate: avg_quality_score, min_quality_score, files_assessed
- `ingestion_summary["adversarial"]` — Aggregate: total_checked, suspicious_count, suspicious_files[]
