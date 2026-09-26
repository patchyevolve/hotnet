# ============================================================
# FACE RESEARCH — INPUT FILE HANDLING FOR IMAGES
# Research Document 11 of 10 (Supplementary)
# ============================================================
#
# This document defines the complete taxonomy of how images
# enter criminal investigation evidence systems, how they
# are classified, and how the pipeline processes each type.
# ============================================================


## ============================================================
## 1. COMPLETE IMAGE INPUT TAXONOMY
## ============================================================

### 1.1 All Possible Input Scenarios

```
Category A: STANDALONE IMAGES (image is the evidence)
  A1. Clean image with no context
  A2. Image with sidecar/metadata file
  A3. Image with filename context (51_SURVEILLANCE_Unknown.jpg)
  A4. Image with EXIF data only

Category B: EMBEDDED IMAGES (image inside a document)
  B1. Image embedded in PDF
  B2. Image embedded in Word document
  B3. Image embedded in Excel spreadsheet
  B4. Image embedded in PowerPoint
  B5. Image in email body/attachment

Category C: COMPOSITE EVIDENCE (multiple files reference same image)
  C1. Image referenced by name in document ("see photo 51...")
  C2. Same image in multiple documents
  C3. Image + separate description file
  C4. Image sequence (same event, multiple shots)

Category D: DOCUMENTS THAT ARE IMAGES (scanned documents)
  D1. Scanned Aadhaar/ID card
  D2. Scanned PAN card
  D3. Scanned passport
  D4. Scanned driver's license
  D5. Scanned FIR/document with photo
  D6. Scanned newspaper clipping with photo

Category E: SCREENSHOTS AND CAPTURES
  E1. Social media profile screenshot
  E2. CCTV export/screenshot
  E3. Mobile photo of physical evidence
  E4. Photo of whiteboard/notice board
  E5. Photo of business card/visiting card

Category F: EXTERNAL FEEDS
  F1. SIM registration photo from carrier
  F2. mugshot from police records
  F3. Photo from facial recognition database
  F4. Photo from missing persons database
```


## ============================================================
## 2. CLASSIFICATION SYSTEM
## ============================================================

### 2.1 Two-Level Classification

Every image input gets classified on two axes:

```
AXIS 1: SOURCE TYPE (Where did the image come from?)
  → Determines extraction strategy

AXIS 2: CONTEXT TYPE (What context accompanies the image?)
  → Determines how to enrich face matching
```

### 2.2 Source Type Classification

```
Source Type              Code    Extraction Strategy
────────────────────────────────────────────────────────────────────
STANDALONE_FILE          SF      Face detection + EXIF only
DOCUMENT_EMBEDDED        DE      Extract from PDF/DOCX/XLSX first
SCREENSHOT               SS      OCR + face detection + text association
SCAN_OF_DOCUMENT        SD      OCR + face extraction + identity extraction
EXTERNAL_FEED            EF      Structured import from known format
IDENTITY_DOCUMENT        ID      OCR + face extraction + identity creation
PHOTO_OF_OBJECT         PO      OCR if text visible, no face expected
PHOTO_OF_PERSON         PP      Face detection primary, OCR secondary
```

### 2.3 Context Type Classification

```
Context Type             Code    Description
────────────────────────────────────────────────────────────────────
NO_CONTEXT               NC      Image alone, no accompanying info
FILENAME_CONTEXT         FC      Filename provides hints (51_SURVEILLANCE...)
SIDECAR_FILE             SC      Companion .json/.txt file with metadata
DOCUMENT_CONTEXT         DC      Text in same document provides context
OVERLAID_TEXT            OT      Text overlaid on image (CCTV timestamp)
EMBEDDED_LABELS          EL      Text labels near face in image
REFERENCED_BY            RB      Another document references this image
IDENTITY_VERIFIED        IV      Document confirms identity (Aadhaar)
```


## ============================================================
## 3. PROCESSING PIPELINE BY CLASSIFICATION
## ============================================================

### 3.1 Master Classification Logic

```python
def classify_image_input(file_path, all_files_in_folder):
    """Classify image input type and determine processing strategy."""
    
    classification = {
        'source_type': None,
        'context_type': None,
        'extraction_methods': [],
        'context_sources': [],
        'processing_priority': []
    }
    
    ext = os.path.splitext(file_path)[1].lower()
    filename = os.path.basename(file_path)
    folder_files = all_files_in_folder
    
    # ──── STEP 1: Determine Source Type ────
    
    if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']:
        # It's an image file
        
        # Check if it's a scanned document
        if is_scanned_document(file_path):
            classification['source_type'] = 'SCAN_OF_DOCUMENT'
        # Check if it's a screenshot
        elif is_screenshot(file_path):
            classification['source_type'] = 'SCREENSHOT'
        # Check filename for context
        elif has_context_in_filename(filename):
            classification['source_type'] = 'STANDALONE_FILE'
        else:
            classification['source_type'] = 'STANDALONE_FILE'
    
    elif ext == '.pdf':
        classification['source_type'] = 'DOCUMENT_EMBEDDED'
    
    elif ext in ['.docx', '.doc']:
        classification['source_type'] = 'DOCUMENT_EMBEDDED'
    
    elif ext in ['.xlsx', '.xls']:
        classification['source_type'] = 'DOCUMENT_EMBEDDED'
    
    # ──── STEP 2: Determine Context Type ────
    
    # Check for sidecar file
    sidecar = find_sidecar(file_path, folder_files)
    if sidecar:
        classification['context_type'] = 'SIDECAR_FILE'
        classification['context_sources'].append(sidecar)
    
    # Check for filename context
    elif has_context_in_filename(filename):
        classification['context_type'] = 'FILENAME_CONTEXT'
    
    # Check for document context (referenced by other files)
    references = find_references_to_file(filename, folder_files)
    if references:
        classification['context_type'] = 'REFERENCED_BY'
        classification['context_sources'].extend(references)
    
    # Check for overlaid text (CCTV timestamps)
    elif has_overlaid_text(file_path):
        classification['context_type'] = 'OVERLAID_TEXT'
    
    else:
        classification['context_type'] = 'NO_CONTEXT'
    
    # ──── STEP 3: Determine Extraction Methods ────
    
    classification['extraction_methods'] = get_extraction_methods(
        classification['source_type'],
        classification['context_type']
    )
    
    return classification


def get_extraction_methods(source_type, context_type):
    """Map classification to extraction methods."""
    
    methods = []
    
    # Always do face detection for images
    if source_type in ['STANDALONE_FILE', 'SCREENSHOT', 'IDENTITY_DOCUMENT', 
                        'PHOTO_OF_PERSON', 'EXTERNAL_FEED']:
        methods.append('face_detection')
    
    # Always do OCR for documents
    if source_type in ['DOCUMENT_EMBEDDED', 'SCAN_OF_DOCUMENT', 'SCREENSHOT']:
        methods.append('ocr_extraction')
    
    # Identity documents need special extraction
    if source_type == 'IDENTITY_DOCUMENT':
        methods.append('identity_extraction')
        methods.append('face_extraction')
    
    # Screenshots need text association
    if source_type == 'SCREENSHOT':
        methods.append('text_face_association')
    
    # Scanned documents need image extraction
    if source_type == 'DOCUMENT_EMBEDDED':
        methods.append('embedded_image_extraction')
        methods.append('text_extraction')
    
    # Context enrichment
    if context_type == 'SIDECAR_FILE':
        methods.append('sidecar_parsing')
    elif context_type == 'DOCUMENT_CONTEXT':
        methods.append('document_context_extraction')
    elif context_type == 'OVERLAID_TEXT':
        methods.append('overlaid_text_extraction')
    elif context_type == 'REFERENCED_BY':
        methods.append('reference_context_extraction')
    
    return methods
```


## ============================================================
## 4. PROCESSING STRATEGIES BY TYPE
## ============================================================

### 4.1 Type A: Standalone Images

```
A1. Clean image (IMG_20240310.jpg)
    → Face detection
    → EXIF extraction
    → No context
    → Status: PENDING

A2. Image with sidecar (51_SURVEILLANCE.jpg + 51_SURVEILLANCE.meta.json)
    → Face detection
    → Parse sidecar for context
    → Context-boosted matching
    → Status: PENDING

A3. Image with filename context (51_SURVEILLANCE_Unknown_Male.jpg)
    → Face detection
    → Parse filename for source type
    → Basic context from filename
    → Status: PENDING

A4. Image with EXIF only
    → Face detection
    → Extract timestamp, GPS, camera from EXIF
    → Limited context
    → Status: PENDING
```

### 4.2 Type B: Embedded Images

```
B1. PDF with embedded images
    → Extract images from PDF pages
    → Extract page text for context
    → Associate faces with nearby text labels
    → Process each extracted image

B2. Word doc with embedded images
    → Extract images from paragraphs
    → Extract paragraph text for context
    → Associate faces with paragraph text
    → Process each extracted image

B3. Excel with embedded images
    → Extract images from cells/sheets
    → Extract cell text for context
    → Associate faces with cell labels
    → Process each extracted image
```

### 4.3 Type C: Composite Evidence

```
C1. Image referenced by document
    → Document says "see photo 51_SURVEILLANCE"
    → Link document context to image
    → Process image with document context

C2. Same image in multiple documents
    → Extract from each document
    → Deduplicate (same hash)
    → Combine context from all sources
    → Higher confidence (multiple sources)

C3. Image + separate description
    → Image file + text file in same group
    → Link by sequence number or proximity
    → Process with combined context

C4. Image sequence
    → Multiple photos of same event
    → Extract faces from each
    → Link by timestamp/location
    → Graph: all faces SEEN_WITH each other
```

### 4.4 Type D: Scanned Documents

```
D1. Scanned ID card (Aadhaar, PAN, Passport)
    → OCR to extract identity fields
    → Extract photo from document
    → Create/update Person record
    → Face embedding: CONFIRMED (high confidence)

D2. Scanned FIR with photo
    → OCR to extract FIR details
    → Extract photo if present
    → Link to case and entities

D3. Scanned newspaper with photo
    → OCR to extract article text
    → Extract photo
    → Context from article text
```

### 4.5 Type E: Screenshots and Captures

```
E1. Social media screenshot
    → OCR to extract profile info (name, username, bio)
    → Extract profile photo
    → Face detection on profile photo
    → Link face to extracted name

E2. CCTV screenshot/export
    → OCR to extract timestamp, camera ID
    → Face detection
    → Context from overlaid text
    → Face matching with timestamp context

E3. Photo of whiteboard
    → OCR/HTR to extract handwritten text
    → Extract names, phone numbers, notes
    → Create entities from extracted data
    → No face extraction (unless person visible)

E4. Photo of business card
    → OCR to extract contact details
    → Create Person/Phone/Organization entities
    → No face extraction (unless photo visible)
```

### 4.6 Type F: External Feeds

```
F1. SIM registration photo
    → Structured import (carrier provides data)
    → Photo + name + phone number
    → Create FaceEmbedding with HIGH confidence
    → Link to Phone entity

F2. Mugshot from records
    → Structured import (police database)
    → Photo + name + case details
    → Create FaceEmbedding with HIGH confidence
    → Link to Person entity

F3. Identity document (Aadhaar, PAN, etc.)
    → OCR + face extraction
    → Create/update Person with verified details
    → Face embedding: CONFIRMED
```


## ============================================================
## 5. CONTEXT ENRICHMENT STRATEGIES
## ============================================================

### 5.1 Context Sources Hierarchy

```
Priority 1: Identity Document (highest confidence)
  → Aadhaar, PAN, Passport confirms person identity
  → Face match: CONFIRMED (95%+)

Priority 2: Official Record
  → SIM registration, mugshot, police record
  → Face match: HIGH confidence (85%+)

Priority 3: Investigator Notes
  → Word/PDF with named individuals
  → Face match: MEDIUM-HIGH (75%+)

Priority 4: CCTV Metadata
  → Timestamp, camera location
  → Face match: MEDIUM (65%+)

Priority 5: Filename Context
  → 51_SURVEILLANCE_Unknown.jpg
  → Face match: LOW-MEDIUM (55%+)

Priority 6: No Context (lowest)
  → Image alone
  → Face match: BASE (50%)
```

### 5.2 Context Extraction by Source

```python
def extract_context_from_source(source_type, file_path):
    """Extract context based on source type."""
    
    context = {}
    
    if source_type == 'IDENTITY_DOCUMENT':
        # Extract structured identity fields
        ocr_result = perform_ocr(file_path)
        context = {
            'name': extract_name(ocr_result),
            'dob': extract_dob(ocr_result),
            'gender': extract_gender(ocr_result),
            'address': extract_address(ocr_result),
            'id_number': extract_id_number(ocr_result),
            'id_type': detect_id_type(file_path),
            'confidence': 0.95
        }
    
    elif source_type == 'SCREENSHOT':
        # Extract profile info from screenshot
        ocr_result = perform_ocr(file_path)
        context = {
            'name': extract_profile_name(ocr_result),
            'username': extract_username(ocr_result),
            'platform': detect_platform(ocr_result),
            'bio': extract_bio(ocr_result),
            'confidence': 0.7
        }
    
    elif source_type == 'DOCUMENT_EMBEDDED':
        # Extract from document context
        doc_text = extract_document_text(file_path)
        context = {
            'surrounding_text': doc_text,
            'named_entities': extract_entities(doc_text),
            'confidence': 0.6
        }
    
    elif source_type == 'EXTERNAL_FEED':
        # Structured data from known format
        context = parse_external_feed(file_path)
    
    return context
```

### 5.3 Face Matching with Context Boost

```python
def match_face_with_context(face_embedding, context):
    """Match face using context for boosting."""
    
    # Base face search
    candidates = search_similar_faces(
        face_embedding.embedding_vector,
        threshold=0.4
    )
    
    # Context boost calculation
    for candidate in candidates:
        boost = 1.0
        
        # Identity document confirmation
        if context.get('id_type') in ['AADHAAR', 'PAN', 'PASSPORT']:
            if candidate['name'] == context.get('name'):
                boost *= 1.5  # 50% boost - confirmed identity
        
        # Official record
        elif context.get('source_type') in ['SIM_REGISTRATION', 'MUGSHOT']:
            if candidate['name'] == context.get('name'):
                boost *= 1.3  # 30% boost
        
        # Investigator notes
        elif context.get('investigator_named'):
            if candidate['name'] in context.get('named_entities', []):
                boost *= 1.2  # 20% boost
        
        # Timestamp/location match
        if context.get('timestamp'):
            if seen_at_time(candidate['id'], context['timestamp']):
                boost *= 1.1  # 10% boost
        
        candidate['adjusted_confidence'] = min(
            candidate['base_confidence'] * boost, 
            1.0
        )
    
    return sorted(candidates, key=lambda x: x['adjusted_confidence'], reverse=True)
```


## ============================================================
## 6. HANDLING SPECIFIC SCENARIOS
## ============================================================

### 6.1 Scenario: Aadhaar Card

```
Input: 56_Aadhaar_Rakesh_Kumar.jpg

Classification:
  source_type: IDENTITY_DOCUMENT
  context_type: IDENTITY_VERIFIED

Processing:
  1. OCR → extract: name="Rakesh Kumar", dob="1990-05-15", 
     gender="MALE", aadhaar="1234-5678-9012"
  2. Extract photo from card
  3. Face detection → 1 face found
  4. Create FaceEmbedding (status=CONFIRMED, confidence=0.95)
  5. Create/update Person record with all details
  6. Link face to person with HIGH confidence

Output:
  Person: person_rakesh (confirmed via Aadhaar)
  Face: face_56_AADHAR_001 (CONFIRMED)
```

### 6.2 Scenario: PDF with Witness Statement and Photos

```
Input: Witness_Statement_Rajesh.pdf

Classification:
  source_type: DOCUMENT_EMBEDDED
  context_type: DOCUMENT_CONTEXT

Processing:
  1. Extract text from PDF
  2. Extract embedded images (3 photos)
  3. For each image:
     - Face detection
     - Find nearest text label
     - Associate face with label
  4. Process each face with document context

Output:
  Image 1: face_001 → "Rakesh Kumar" (from caption)
  Image 2: face_002 → "Suresh Kumar" (from caption)
  Image 3: face_003 → no face (building photo)
```

### 6.3 Scenario: Social Media Screenshot

```
Input: Social_Media_Suresh.png

Classification:
  source_type: SCREENSHOT
  context_type: OVERLAID_TEXT (text visible in screenshot)

Processing:
  1. OCR → extract: "Suresh Kumar", "@suresh_9876", "Delhi | Business"
  2. Detect profile photo region
  3. Face detection in profile photo
  4. Associate face with extracted name
  5. Create FaceEmbedding with context

Output:
  Person: "Suresh Kumar" (from social media)
  Face: face_52_social_001 (MEDIUM confidence - social media)
```

### 6.4 Scenario: CCTV Frame with Timestamp

```
Input: 42_CCTV_Capture_Amit.png

Classification:
  source_type: SCREENSHOT (CCTV export)
  context_type: OVERLAID_TEXT (timestamp + camera ID)

Processing:
  1. OCR → extract: "CAM 03", "2024-03-10 14:25:30", "BANK ATM NORTH"
  2. Face detection → 1 face found
  3. Context: timestamp + location from overlay
  4. Face matching with timestamp/location boost

Output:
  Face: face_42_CCTV_001
  Context: "Seen at Bank ATM North on 2024-03-10 14:25"
  Match attempt: searching for persons near that location at that time
```

### 6.5 Scenario: Photo of Whiteboard

```
Input: Photo_Whiteboard_Contacts.jpg

Classification:
  source_type: PHOTO_OF_OBJECT
  context_type: NO_CONTEXT (text is IN the image)

Processing:
  1. OCR/HTR → extract: "Rakesh - 9876543210", "Suresh - 9876543211"
  2. Face detection → 0 faces (whiteboard only)
  3. Create entity records from extracted data
  4. No face processing

Output:
  Phone 9876543210 → linked to "Rakesh"
  Phone 9876543211 → linked to "Suresh"
```

### 6.6 Scenario: Multiple Documents Reference Same Image

```
Files:
  Witness_Statement_Rajesh.pdf  → contains "photo 51"
  Investigation_Notes.docx      → references "see photo 51"
  51_SURVEILLANCE_Unknown.jpg   → the actual image

Classification:
  Image: STANDALONE_FILE + REFERENCED_BY
  Context: from both PDF and DOCX

Processing:
  1. Extract context from PDF (witness statement)
  2. Extract context from DOCX (investigator notes)
  3. Combine contexts
  4. Process image with enriched context

Output:
  Face: face_51_SURV_001
  Context: "Witness saw unknown male near crime scene (per Rajesh)"
           "Investigator notes: possible lookout for gang"
  Match: boosted by combined context
```

### 6.7 Scenario: SIM Registration Form

```
Input: 23_SIM_Reg_Suresh.png

Classification:
  source_type: EXTERNAL_FEED (carrier format)
  context_type: IDENTITY_VERIFIED

Processing:
  1. OCR → extract: name="Suresh Kumar", phone="9876543211"
  2. Extract photo from form
  3. Face detection → 1 face
  4. Create FaceEmbedding (HIGH confidence)
  5. Link to Phone entity

Output:
  Phone: 9876543211 → person_suresh (confirmed via SIM)
  Face: face_23_SIM_001 (HIGH confidence)
```


## ============================================================
## 7. CLASSIFICATION DECISION TREE
## ============================================================

```
START: New file in evidence folder
│
├─ Is it an IMAGE file?
│   ├─ YES
│   │   ├─ Does it look like a scanned ID document?
│   │   │   ├─ YES → IDENTITY_DOCUMENT
│   │   │   └─ NO
│   │   │       ├─ Does it have overlaid text (timestamp, camera)?
│   │   │       │   ├─ YES → SCREENSHOT (CCTV)
│   │   │       │   └─ NO
│   │   │       │       ├─ Does it have text visible in image?
│   │   │       │       │   ├─ YES → PHOTO_OF_OBJECT
│   │   │       │       │   └─ NO
│   │   │       │       │       ├─ Is it a social media profile?
│   │   │       │       │       │   ├─ YES → SCREENSHOT
│   │   │       │       │       │   └─ NO → STANDALONE_FILE
│   │   
│   └─ NO (PDF, DOCX, XLSX, etc.)
│       └─ DOCUMENT_EMBEDDED
│           └─ Extract images, then process each as above
│
├─ Is there a SIDECAR file?
│   ├─ YES → context_type = SIDECAR_FILE
│   └─ NO
│       ├─ Does filename provide context?
│       │   ├─ YES → context_type = FILENAME_CONTEXT
│       │   └─ NO
│       │       ├─ Does another file reference this?
│       │       │   ├─ YES → context_type = REFERENCED_BY
│       │       │   └─ NO → context_type = NO_CONTEXT
```


## ============================================================
## 8. PIPELINE INTEGRATION
## ============================================================

### 8.1 Updated Stage 1: Ingestion

```
Stage 1: Ingestion
├── Read all files in folder
├── Classify each file (source_type + context_type)
├── Group related files (sequence numbers, references)
├── For DOCUMENT_EMBEDDED:
│   ├── Extract embedded images
│   ├── Extract text/context
│   └── Create records for extracted images
├── For IDENTITY_DOCUMENT:
│   ├── OCR to extract identity fields
│   ├── Extract photo
│   └── Create/update Person record
├── For all images:
│   ├── Store in R2
│   ├── Extract available context
│   └── Create IngestedFile record with classification
└── Link context sources to images
```

### 8.2 Updated Stage 1.5: Face Detection

```
Stage 1.5: Face Detection
├── For each image (standalone + extracted):
│   ├── Detect faces
│   ├── OCR text in image
│   ├── Detect overlaid text
│   ├── Associate faces with nearby text
│   ├── Quality assessment
│   └── Create FaceEmbedding record
├── For IDENTITY_DOCUMENT:
│   ├── Face status = CONFIRMED
│   └── High confidence (0.95)
├── For SCREENSHOT:
│   ├── Extract profile info
│   └── Link face to extracted name
└── For PHOTO_OF_OBJECT:
    └── No face extraction (skip)
```

### 8.3 Updated Stage 3: Resolution

```
Stage 3: Resolution
├── For each FaceEmbedding:
│   ├── Search similar faces in database
│   ├── Apply context boosts:
│   │   ├── IDENTITY_DOCUMENT: +50%
│   │   ├── EXTERNAL_FEED: +30%
│   │   ├── DOCUMENT_CONTEXT: +20%
│   │   ├── TIMESTAMP_MATCH: +10%
│   │   └── LOCATION_MATCH: +10%
│   ├── Create resolution candidates
│   └── Flag for investigator review
└── For unknown faces:
    └── Add to graph as unknown node
```


## ============================================================
## 9. SUMMARY
## ============================================================

```
Complete Classification System:
  AXIS 1: Source Type (8 types)
    SF, DE, SS, SD, EF, ID, PO, PP
  
  AXIS 2: Context Type (8 types)
    NC, FC, SC, DC, OT, EL, RB, IV

Processing Matrix:
  Each combination → specific extraction strategy
  Context enrichment → boosted face matching
  Identity documents → confirmed identity
  Unknown faces → graph nodes until matched

Key Principles:
  1. Classify first, then process accordingly
  2. Extract context from whatever is available
  3. Link related files automatically
  4. Use context to improve face matching
  5. Handle the messiness of real-world evidence
  6. No special file formats required
  7. Investigator drops files, pipeline figures it out
```
