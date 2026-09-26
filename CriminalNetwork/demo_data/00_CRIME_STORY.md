# Case Background: Operation Digital Fraud

## Case Summary

Meena Devi (aged 34, resident of Lajpat Nagar, New Delhi) filed a complaint on 15 March 2024 at Nehru Nagar Police Station alleging that she was defrauded of ₹15,00,000 (fifteen lakh rupees) through a series of fraudulent bank transfers orchestrated by individuals impersonating bank officials.

---

## Key Persons

| # | Name | Role | Phone | Notes |
|---|------|------|-------|-------|
| 1 | Meena Devi | Victim/Complainant | 9876543213 | SBI account ending 4523, Lajpat Nagar |
| 2 | Rakesh Kumar | Primary Suspect | 9876543210 | Runs "RK Telecom" in Karol Bagh |
| 3 | Suresh Kumar | Suspect | 9876543211 | HDFC account ending 7891, Dwarka |
| 4 | Amit Sharma | Suspect | 9876543212 | Social: amit_sharma_official, Noida |
| 5 | Rajesh Kumar | Witness | 9876543214 | Neighbor of victim, Lajpat Nagar |

---

## Timeline of Events (Ground Truth)

| Date | Event | Evidence |
|------|-------|----------|
| 12 Mar 2024 | Meena Devi receives first phishing call | CDR, FIR |
| 13 Mar 2024 | Second call, victim shares OTP | CDR, FIR |
| 14 Mar 2024 | Three transfers: ₹5L + ₹5L + ₹5L | Bank records |
| 15 Mar 2024 | FIR filed at Nehru Nagar PS | 01_FIR.txt |
| 16 Mar 2024 | Suspect calls witness (threat) | CDR |
| 22 Mar 2024 | Rakesh Kumar arrested | Investigation report |
| 25 Mar 2024 | Suresh Kumar arrested | Investigation report |
| 28 Mar 2024 | Amit Sharma arrested | Investigation report |

---

## Evidence Files Map

### Baseline Files (01-20)
Core investigation dataset.

| File | Type | Content | What It Tests |
|------|------|---------|---------------|
| 01_FIR.txt | Text | FIR details | Text extraction, entity linking |
| 02_CDR_Rakesh.csv | Tabular | Rakesh call records | CDR parsing, tower correlation |
| 03_CDR_Suresh.csv | Tabular | Suresh call records | Multi-source CDR merge |
| 04_CDR_Amit.csv | Tabular | Amit call records | Call network analysis |
| 05_Bank_Rakesh.csv | Tabular | Rakesh bank transactions | Transaction flow tracking |
| 06_Bank_Suresh.csv | Tabular | Suresh bank accounts | Multi-account tracking |
| 07_Bank_Amit.csv | Tabular | Amit bank records | Money trail analysis |
| 08_Device_Rakesh.json | Structured | Phone app data | Device forensics parsing |
| 09_Social_Amit.json | Structured | Instagram profile | Social network extraction |
| 10_CCTV_Log.csv | Tabular | CCTV observations | Visual evidence correlation |
| 11_Criminal_History.json | Structured | Prior records | Background check analysis |
| 12_WEIRD_CDR.csv | Tabular | CDR with gaps, weird formats | Edge case parsing |
| 13_FIR_Rajesh.txt | Text | Witness FIR | Cross-referencing |
| 14_CDR_Meena.csv | Tabular | Victim's phone records | Victim communication pattern |
| 15_Bank_Meena.csv | Tabular | Victim's bank account | Fund flow origin |
| 16_Device_Amit.json | Structured | Amit's phone data | Corroborating evidence |
| 17_Social_Rakesh.json | Structured | Rakesh's social media | Online activity correlation |
| 18_Witness_Statement.txt | Text | Rajesh Kumar's statement | Witness testimony |
| 19_Surveillance_Report.txt | Text | Police surveillance notes | Field observation |
| 20_Journalist_Note.txt | Text | Media coverage | External source |

### Edge Case Files (21-45)
Gaps, contradictions, and adversarial patterns.

| File | Category | What It Tests |
|------|----------|---------------|
| 21_Missing_Phone_CDR.csv | Missing Data | CDR with missing phone numbers, tower gaps |
| 22_Bank_No_Name.csv | Missing Data | Bank records with unknown account holder |
| 23_FIR_No_Phone.txt | Missing Data | FIR missing complainant phone |
| 24_CCTV_Gap_Timestamps.csv | Missing Data | CCTV with time gaps in footage |
| 25_Social_Partial.json | Missing Data | Social media with incomplete profile |
| 26_Name_Variation_CDR.csv | Entity Resolution | Same person: Rakesh K, R. Kumar, Rakesh Kumar Singh |
| 27_Temporal_Contradiction_CDR.csv | Temporal | Same person at two locations same time |
| 28_Source_Dependency_CDR.csv | Provenance | CDR that confirms FIR (1 independent source) |
| 29_Investigator_Summary.txt | Provenance | Summary derived from FIR (not independent) |
| 30_Adversarial_CDR.csv | Adversarial | Fabricated call patterns to frame suspect |
| 31_Adversarial_Bank.csv | Adversarial | Manipulated timestamps in bank records |
| 32_Adversarial_Social.json | Adversarial | Fake social media interactions |
| 33_Adversarial_CCTV.csv | Adversarial | CCTV with manipulated location data |
| 34_Feedback_Loop_Report.txt | Feedback | Report derived from summary (not FIR) |
| 35_Identity_Uncertainty_CCTV.csv | Identity | CCTV with "possible match" descriptions |
| 36_Hindi_Witness_Statement.txt | Hindi | Devanagari script, Hindi filler words |
| 37_Hypothesis_Competition_CDR.csv | Hypothesis | Evidence distributed across multiple suspects |
| 38_Falsification_CDR.csv | Falsification | Evidence contradicting primary hypothesis |
| 39_Feedback_Loop_CDR.csv | Edge Case | Circular communication patterns |
| 40_Self_Loop_CCTV.csv | Edge Case | CCTV with self-reference patterns |
| 41_Self_Loop_CDR.csv | Edge Case | CDR with self-calls (phone calling itself) |
| 42_Complex_Resolution_CDR.csv | Entity Resolution | Multiple similar names requiring disambiguation |
| 43_Adversarial_Identity_CDR.csv | Adversarial | Identity manipulation in call records |
| 44_Circular_Reference_CDR.csv | Edge Case | Circular reference patterns |
| 45_Confidence_Edge_Cases_CDR.csv | Edge Case | Very short calls testing confidence propagation |

### Document Type Files (46-49)
PDF, DOCX, XLSX, and image parsing.

| File | Type | Content | What It Tests |
|------|------|---------|---------------|
| 46_FIR_Supplement.pdf | PDF | FIR supplement document | PDF text extraction, embedded tables |
| 47_FIR_Supplement.docx | DOCX | FIR supplement document | DOCX text + table extraction |
| 48_Bank_Transactions.xlsx | XLSX | Bank transaction spreadsheet | Excel parsing, multi-sheet support |
| 49_CCTV_Screenshot.png | Image | CCTV screenshot with text | OCR (Hindi + English), quality gate |

---

## What We're Testing

### Stage 1: Ingestion
- Text extraction from .txt files
- CSV parsing with missing values, weird formats, comment lines
- JSON parsing with nested objects
- PDF parsing (pdfplumber text + tables, OCR fallback)
- DOCX parsing (python-docx text + tables)
- XLSX parsing (openpyxl)
- Image OCR (pytesseract Hindi + English)
- Source-origin epistemic contract (6 properties)
- Adversarial detection on ingest
- Hindi filler removal (requires LLM)

### Stage 2: Extraction
- Entity extraction: Person, Phone, Location, BankAccount, Organization, Amount, Date, Event
- Relation extraction: Call, Transaction, Ownership, CoOccurrence, FamilyOrAssociate
- Pattern-based extraction (code-only mode)
- LLM-based extraction (requires AI provider)

### Stage 3: Entity Resolution
- Exact matching (Rakesh Kumar = Rakesh Kumar)
- Name variations (Rakesh K = Rakesh Kumar = R. Kumar)
- Phonetic matching (Indian names)
- Fuzzy matching with edit distance
- Multi-signal disambiguation
- Review gate for uncertain matches
- **Negative controls**: Suresh Kumar ≠ Suresh Singh (different person)

### Stage 4: Temporal Reasoning
- Allen's interval algebra (before, meets, overlaps, during, starts, finishes, equals)
- Temporal contradiction detection
- Timeline event ordering
- Event clustering by location and time

### Stage 5: Graph Construction
- Knowledge graph with typed nodes and edges
- Confidence propagation along edges
- Missing edge detection
- Rejected edge tracking
- Edge type classification (associational, entrepreneurial, quasi-governmental)

### Stage 6: Analytics
- Source dependency chains (FIR → Summary → Report)
- Independent vs derived source counting
- Inflation prevention (2 derived sources ≠ 1 independent source)
- Epistemic status tracking (observation vs inference)
- Feedback loop detection (inference repeated as observation)

---

## Rate Limiting Analysis

### LLM Call Estimate (50 evidence files)

| Stage | Calls | Notes |
|-------|-------|-------|
| Extraction | ~50 | 1 call per file |
| Entity validation | ~7 | 209 entities / 30 per batch |
| Resolution LLM pass | ~51 | 1 call per candidate group |
| **Total** | **~108** | |

### Provider Limits vs Required Calls

| Provider | RPM | Time for 108 Calls | Status |
|----------|-----|-------------------|--------|
| Groq | 30 | ~3.6 min | Hits limit |
| SiliconFlow | 60 | ~1.8 min | OK |
| Google | 15 | ~7.2 min | Hits limit |
| Ollama | 999 | ~18 sec | OK (local) |
| OpenRouter | 20 | ~5.4 min | Hits limit |

### Pipeline Timeout Calculation
- 108 calls × 2s minimum delay = 216s
- Plus API response time (~1-3s per call) = 216-540s
- Plus retry/backoff on rate limit hits
- **Recommended timeout: 600s (10 min) for --use-llm**

### Rate Limiting Features Built In
- Token bucket rate limiter (RPM/RPD/TPM)
- 2-second minimum delay between calls
- Auto-switch provider on rate limit
- Retry with exponential backoff (3 attempts)
- Provider priority sorting

---

## Gaps and Missing Data

### Intentionally Missing
| Gap | File | Why |
|-----|------|-----|
| Missing phone numbers | 21_Missing_Phone_CDR.csv | Tests incomplete data handling |
| Unknown account holder | 22_Bank_No_Name.csv | Tests entity creation without names |
| Missing complainant phone | 23_FIR_No_Phone.txt | Tests text extraction gaps |
| CCTV time gaps | 24_CCTV_Gap_Timestamps.csv | Tests temporal gap handling |
| Incomplete social profile | 25_Social_Partial.json | Tests partial data merge |

### Now Covered (Added)
| Gap | File | Status |
|-----|------|--------|
| PDF parsing | 46_FIR_Supplement.pdf | ✓ Added |
| DOCX parsing | 47_FIR_Supplement.docx | ✓ Added |
| XLSX parsing | 48_Bank_Transactions.xlsx | ✓ Added |
| Image OCR | 49_CCTV_Screenshot.png | ✓ Added |

### Still Requires LLM
| Gap | Why |
|-----|-----|
| Hindi filler removal | Needs LLM to identify and strip Hindi filler words |
| Entity type reclassification | LLM needed to reclassify entities based on context |
| Full adversarial detection | Complex pattern recognition needs LLM |

---

## Edge Cases Matrix

| Edge Case | File(s) | Expected Behavior |
|-----------|---------|-------------------|
| Self-calls | 41_Self_Loop_CDR.csv | Filter out or flag as anomalous |
| Same person, multiple names | 26_Name_Variation_CDR.csv | Merge with high confidence |
| Same person, different location same time | 27_Temporal_Contradiction_CDR.csv | Flag contradiction, don't inflate confidence |
| Source dependency chain | 28-29 | Count as 1 independent source, not 2 |
| Adversarial evidence | 30-33, 43 | Don't let weak evidence override strong evidence |
| Feedback loop | 34, 39 | Preserve epistemic distinction (inference ≠ observation) |
| Identity uncertainty | 35 | Track multiple candidates, propagate uncertainty |
| Hypothesis competition | 37 | Multiple suspects with distributed evidence |
| Falsification | 38 | Detect contradicting evidence, decrease confidence |
| Circular references | 44 | Handle without infinite loops |
| Confidence edge cases | 45 | Very short calls should have lower confidence |
| PDF with embedded tables | 46 | Extract both text and tables |
| DOCX with tables | 47 | Extract paragraphs and table data |
| XLSX spreadsheet | 48 | Parse rows/columns correctly |
| Image with text | 49 | OCR extraction with quality gate |

---

## File Count Summary

- **Total files**: 51 (including 00_CRIME_STORY.md and TEST_MANIFEST.json)
- **Evidence files**: 50 (processed by pipeline)
- **Skipped**: 1 (00_CRIME_STORY.md - context only)
- **Baseline**: 20 files (01-20)
- **Edge cases**: 25 files (21-45)
- **Document types**: 4 files (46-49)
- **Test manifest**: 1 file with 25 test scenarios

### Pipeline Results (Code-Only Mode)
- Entities extracted: 209
- Relations extracted: 383
- Auto-merges: 48
- Review required: 3
- Contradictions: 15
- Graph nodes: 174
- Graph edges: 75
- Rejected edges: 5
- Processing time: ~1.5s
