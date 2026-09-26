# SECURITY & BLOCKCHAIN PITCH — Daksh Walia

## Opening Line

> "For security, we implement a zero-trust architecture with three layers: access control, data protection, and evidence integrity via blockchain."

---

## Access Control — RBAC + MFA

### System Roles

| Role | Permissions |
|------|------------|
| **Inspector** | Create/read/update cases, upload evidence, run analytics |
| **Senior Officer** | Administrative closure/archive, some legal transitions, grant case access |
| **Legal Authority** | Legal disposition transitions (quash, convict, acquit) |
| **Admin** | Manage users, system settings, all case access |
| **Audit Logger** | Read-only, every access is logged |

### Case Access (Authorization)

> "CaseAccess controls who may access which Cases — this is separate from workspace membership. When a Case is created, the creator gets ADMIN access. Senior officers and admins can grant access to others. Access levels are READ, WRITE, and ADMIN. Access can have expiration dates."

### FIR Lifecycle Authorization

> "FIR lifecycle transitions are explicit controlled actions, not arbitrary field edits. Sensitive transitions like legal disposition or sealing require appropriate authorization and an auditable authority reference. The system defines configurable authorization policies — the software doesn't make universal legal claims about who can do what. Every transition generates FIRLifecycleHistory and AuditLog entries."

### MFA
> "Multi-Factor Authentication is required for all logins. We support TOTP (Google Authenticator) and SMS OTP. Session tokens are short-lived (1 hour) with refresh token rotation."

### Zero-Trust
> "Every request is authenticated and authorized — no implicit trust. Even internal service-to-service calls require mTLS certificates."

---

## Data Protection

### Encryption
> "**AES-256 encryption** at rest for all evidence files and sensitive data. **TLS 1.3** in transit for all API communication. Database-level encryption with PostgreSQL TDE (Transparent Data Encryption)."

### File Storage
> "Evidence files are stored in Cloudflare R2 — encrypted at rest with AES-256, access-controlled via signed URLs that expire in 15 minutes. No direct file access — everything goes through the API."

### API Security
> "Rate limiting (100 requests/minute per user), input validation (SQL injection, XSS prevention), CORS restricted to allowed origins, request signing for inter-service communication."

---

## Blockchain Evidence Integrity

### What It Solves
> "In court, the defense can argue evidence was tampered with. Blockchain creates an immutable record that proves evidence hasn't been modified since collection."

### How It Works

```
Evidence File → SHA-256 Hash → Blockchain Record → Timestamp → Verification
```

**Step by step:**
1. **Hash Generation:** When evidence is ingested, we compute SHA-256 hash of the original file
2. **Blockchain Record:** Hash + metadata (file name, case ID, timestamp, user ID) written to blockchain
3. **Timestamping:** Block confirmation creates immutable timestamp
4. **Integrity Verification:** Anytime evidence is accessed, hash is re-computed and compared to blockchain record
5. **Tamper Detection:** If hash doesn't match → evidence has been modified → alert generated

### What Gets Hashed

| Item | Hash Purpose |
|------|-------------|
| Evidence files | Prove file hasn't been modified |
| Case reports | Prove report hasn't been altered |
| Graph state snapshots | Prove analysis results are authentic |
| Audit logs | Prove logs haven't been tampered with |

### Blockchain Type
> "For our MVP, we're using a **permissioned blockchain** (Hyperledger Fabric). This gives us: (1) immutability — once written, can't be changed, (2) permissioned access — only authorized nodes can write, (3) fast throughput — 1000+ TPS vs Ethereum's 15 TPS, (4) low cost — no gas fees."

### Legal Admissibility
> "Under the **Indian Evidence Act, Section 65B**, electronic records are admissible if we can prove integrity. Blockchain hashes provide this proof — they're cryptographically secure, timestamped, and independently verifiable. The defense can't argue the evidence was planted because the hash was recorded before the investigation."

### What Blockchain Does NOT Do
> "We don't store evidence on-chain — just hashes. The actual files stay in R2. We don't use smart contracts for investigation logic — that's overkill. We don't use public blockchain — too slow and expensive. The blockchain is purely for integrity verification."

---

## Cybersecurity Layer (From Your PPT)

| Component | Implementation |
|-----------|---------------|
| RBAC + MFA | Better Auth with Google OAuth, role-based middleware |
| AES Encryption | File-level AES-256, database TDE |
| TLS | TLS 1.3 for all API communication |
| Zero-Trust | Every request authenticated, mTLS for services |
| Audit Logs | Every action logged with timestamp, user, IP |
| Data Integrity | SHA-256 hashing, blockchain verification |
| Secure API Gateway | Rate limiting, input validation, CORS |

---

## Audit Trail

> "Every action in the system generates an audit log entry:"

| Field | Value |
|-------|-------|
| Timestamp | ISO 8601 |
| User ID | Who did it |
| Action | What they did (CREATE, UPDATE, DELETE, READ_SENSITIVE, EXPORT) |
| Resource | What they affected (case, evidence, entity) |
| IP Address | Where they did it |
| Metadata | Additional context |

> "Audit logs are append-only — they can't be modified or deleted, even by admins. This is required for court evidence chain of custody."

### Specialized Audit Trails

> "In addition to the system-wide AuditLog, we maintain domain-specific audit trails:"

| Trail | Purpose |
|-------|---------|
| **FIRLifecycleHistory** | Complete history of every FIR lifecycle transition — dimension, previous value, new value, actor, timestamp, reason, authority reference |
| **CaseRelationshipHistory** | Complete history of how Case relationship assessments evolved — from initial SHARED_ENTITY observation to investigator-confirmed SAME_INCIDENT |
| **ResolutionHistory** | Complete history of entity resolution decisions |

> "These specialized trails are for domain-specific queries. The system-wide AuditLog is for security and operations monitoring. Both are generated for relevant actions."

---

## DPDP Act 2023 Compliance

| Principle | Implementation |
|-----------|---------------|
| Data Minimization | Collect only evidence needed for investigation |
| Purpose Limitation | Use data only for criminal investigation |
| Storage Limitation | Auto-delete after 7 years (configurable) |
| Security Safeguards | Encryption, access control, audit logs |
| Consent | Investigator consent for evidence collection |
| Breach Notification | 72-hour notification to Data Protection Board |

### FIR Lifecycle and Data Retention

> "FIR lifecycle state controls data handling, not data existence. When a FIR is ARCHIVED or QUASHED, evidence and analysis results remain stored and referencable. Lifecycle state affects what operations are permitted — not whether the record exists. This is important for court proceedings where historical evidence must be preserved."

---

## Numbers to Memorize

| Metric | Value |
|--------|-------|
| Encryption standard | AES-256 (at rest), TLS 1.3 (in transit) |
| Auth methods | Google OAuth + Email/Password + MFA |
| System roles | 5 (Inspector, Senior Officer, Legal Authority, Admin, Audit Logger) |
| Case access levels | 3 (READ, WRITE, ADMIN) |
| Session timeout | 1 hour |
| Rate limiting | 100 req/min per user |
| Blockchain type | Permissioned (Hyperledger Fabric) |
| Hash algorithm | SHA-256 |
| Evidence retention | 7 years |
| Breach notification | 72 hours |
| FIR lifecycle dimensions | 3 (investigation_status, legal_disposition, record_status) |

---

## Tricky Questions

**Q: What blockchain do you use? Why not Ethereum?**
> "We use Hyperledger Fabric — a permissioned blockchain. Ethereum is public, slow (15 TPS), and expensive (gas fees). Hyperledger gives us 1000+ TPS, no gas fees, and permissioned access. For evidence integrity, we don't need public consensus — we need fast, cheap, immutable hashing."

**Q: How does blockchain help if the evidence file itself is modified?**
> "That's exactly the point. If someone modifies the evidence file, the hash changes. When we re-compute the hash and compare it to the blockchain record, it won't match. That's tamper detection. The blockchain proves the file was modified after ingestion."

**Q: What about data privacy? DPDP Act compliance?**
> "We follow DPDP Act 2023 principles: data minimization, purpose limitation, storage limitation, and security safeguards. Personal data is encrypted at rest. Investigators can only access data for their assigned cases. We auto-delete after 7 years. Breach notification within 72 hours to the Data Protection Board."

**Q: Can admins delete evidence?**
> "No. Audit logs are append-only. Evidence files can be marked as 'dismissed' but not deleted. The blockchain hash remains as proof that the evidence existed. FIR lifecycle transitions like QUASHING don't delete anything — evidence, analysis, and findings remain stored and referencable. This is required for court — you can't destroy evidence."

**Q: What if the blockchain itself is compromised?**
> "Hyperledger Fabric uses PBFT consensus — it requires 2/3 of nodes to agree. An attacker would need to compromise multiple independent nodes simultaneously. For our permissioned network, nodes are controlled by the police department, so this is a physical security issue, not a technical one."

**Q: How is this different from just using a hash file?**
> "A hash file on a regular server can be modified by an admin. Blockchain hashes are distributed across multiple nodes — no single point of failure. Plus, blockchain provides timestamping — we know exactly when the hash was recorded. A hash file doesn't prove when it was created."

**Q: What about quantum computing breaking SHA-256?**
> "SHA-256 is quantum-resistant for practical purposes — Grover's algorithm reduces it to 128-bit security, which is still secure. For future-proofing, we can migrate to SHA-3 or quantum-resistant algorithms when they're standardized. The architecture is hash-agnostic — we can swap algorithms."

**Q: Is this actually production-ready?**
> "The architecture is designed. The prototype uses simulated blockchain (hash chain in PostgreSQL). For production, we'd deploy Hyperledger Fabric with proper node distribution. The key point is the architecture works — we've designed it to be production-ready, even if the demo uses a simplified version."
