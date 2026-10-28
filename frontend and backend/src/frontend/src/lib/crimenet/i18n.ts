/**
 * CrimeNet — interface label translations (EN / HI).
 *
 * Only interface chrome is translated; record data (names, case titles) stays
 * in its source language, which is standard for investigative tooling.
 */

import type { Language } from "./types";

export interface UiStrings {
  searchPlaceholder: string;
  searchHint: string;
  notifications: string;
  profile: string;
  signOut: string;
  language: string;
  systemStatus: string;
  collapseSidebar: string;
  expandSidebar: string;
  commandPalette: string;
  commandPaletteHint: string;
  noResults: string;
  loading: string;
  viewAll: string;
  openRecord: string;
  close: string;
  filters: string;
  reset: string;
  apply: string;
  all: string;
  risk: string;
  status: string;
  district: string;
  updated: string;
  opened: string;
  leadOfficer: string;
  evidence: string;
  linkedCases: string;
  progress: string;
  overview: string;
  timeline: string;
  network: string;
  reports: string;
  entities: string;
  identifiers: string;
  attributes: string;
  tags: string;
  firstSeen: string;
  lastSeen: string;
  confidence: string;
  camera: string;
  captured: string;
  matchStatus: string;
  integrity: string;
  custody: string;
  collectedBy: string;
  storageRef: string;
  hash: string;
  size: string;
  actor: string;
  action: string;
  target: string;
  severity: string;
  chain: string;
  askAnalyst: string;
  askPlaceholder: string;
  send: string;
  insights: string;
  citations: string;
  suggestedPrompts: string;
  totalVolume: string;
  flaggedVolume: string;
  accounts: string;
  transactions: string;
  channel: string;
  amount: string;
  from: string;
  to: string;
  occurred: string;
  note: string;
  caller: string;
  callee: string;
  duration: string;
  cellTower: string;
  type: string;
  flagged: string;
  totalCalls: string;
  uniqueNumbers: string;
  flaggedCalls: string;
  nightCalls: string;
  topContacts: string;
  hourlyDistribution: string;
  markers: string;
  links: string;
  legend: string;
  selectMarker: string;
  noSelection: string;
  emptyTitle: string;
  emptyBody: string;
  clearFilters: string;
  showing: string;
  of: string;
  results: string;
  page: string;
  previous: string;
  next: string;
  demoDataNotice: string;
  commandCenter: string;
  commandCenterSubtitle: string;
  activeCases: string;
  entitiesIdentified: string;
  relationships: string;
  highRiskNetworks: string;
  activeInvestigations: string;
  liveIntelligenceFeed: string;
  caseActivity: string;
  networkActivity: string;
  riskDistribution: string;
  scopeLabel: string;
  scopeAllCases: string;
  entitiesCenterLabel: string;
  caseActivityEmpty: string;
  networkActivityEmpty: string;
  liveLabel: string;
  checkedLabel: string;
  degraded: string;
  caseWorkbench: string;
  cdr: string;
  moneyTrail: string;
  commandMap: string;
  entityIntelligence: string;
  faceIntelligence: string;
  aiInvestigator: string;
  evidenceVault: string;
  securityAudit: string;
  connections: string;
  cases: string;
  communications: string;
  financialActivity: string;
  locations: string;
  linkedCasesCount: string;
  phoneNumbers: string;
  bankAccounts: string;
  associates: string;
  vehicles: string;
  viewTimeline: string;
  expandNetwork: string;
  openCases: string;
  traceMoney: string;
  viewOnMap: string;
  viewOnNetwork: string;
  viewMoneyTrail: string;
  viewCase: string;
  finding: string;
  evidenceLabel: string;
  actions: string;
  totalCallsLabel: string;
  uniqueNumbersLabel: string;
  commonNumbers: string;
  anomalies: string;
  communicationTimeline: string;
  tracedAmount: string;
  movementAnalysis: string;
  layers: string;
  timeOfDay: string;
  auditEvents: string;
  pendingApprovals: string;
  securityAlerts: string;
  highRiskUsers: string;
  auditTimeline: string;
  integrityVerified: string;
  evidenceId: string;
  caseLabel: string;
  uploadedBy: string;
  timestamp: string;
  entityType: string;
  relationshipType: string;
  caseFilter: string;
  riskLevel: string;
  dateRange: string;
  zoomIn: string;
  zoomOut: string;
  resetView: string;
  focusNode: string;
  expand: string;
  incidentMarkers: string;
  riskAreas: string;
  cellTowers: string;
  entityLocations: string;
  movementTrails: string;
  callLocations: string;
  allEntities: string;
  entityList: string;
  openProfile: string;
  searchEntities: string;
  linkAnalysis: string;
  networkDescription: string;
  geospatialIntelligence: string;
  mapDescription: string;
  caseScope: string;
  telecomAnalysis: string;
  cdrDescription: string;
  financialIntelligence: string;
  moneyTrailDescription: string;
  integrityAccess: string;
  securityDescription: string;
  evidenceManagement: string;
  evidenceDescription: string;
  analystAssistant: string;
  aiDescription: string;
  entityProfile: string;
  entityDescription: string;
  caseWorkbenchDescription: string;
  caseRegistry: string;
  caseRegistryDescription: string;
  biometricIntelligence: string;
  faceDescription: string;
  record: string;
  started: string;
  item: string;
  collected: string;
  txn: string;
  event: string;
  ipAddress: string;
  previousHash: string;
  role: string;
  markerType: string;
  linkedMarkers: string;
  mapLayerSchematic: string;
  mapSchematicNote: string;
  vaultIntegrityOverview: string;
  chainVerified: string;
  chainVerifiedDetail: string;
  demoModeNoModel: string;
  howDerived: string;
  generationLabel: string;
  runLabel: string;
  supportingLabel: string;
  contradictingLabel: string;
  alternativesLabel: string;
  noModelAnswer: string;
  replyInsights: string;
  replyEntities: string;
  replyEvidence: string;
  nullHypothesisLabel: string;
  askPromptHypotheses: string;
  askPromptHighRisk: string;
  askPromptEvidence: string;
  analyst: string;
  aiInvestigatorName: string;
  refresh: string;
  operational: string;
  noLinkedEntities: string;
  noLinkedEntitiesBody: string;
  noLinkedCases: string;
  noCustodyEvents: string;
  selectRecord: string;
  selectTransaction: string;
  selectAuditEvent: string;
  selectEvidence: string;
  entityNotFound: string;
  backToEntities: string;
  quickView: string;
  openFullProfile: string;
  entityQuickView: string;
  linkedCounts: string;
  casesCount: string;
  phonesCount: string;
  accountsCount: string;
  locationsCount: string;
  vehiclesCount: string;
  totalItems: string;
  verified: string;
  integrityFlags: string;
  flaggedEvents: string;
  chainIntegrity: string;
  volumeByChannel: string;
  noChannelData: string;
  accountFlowGraph: string;
  lineThicknessNote: string;
  callsGroupedNote: string;
  movementSequence: string;
  unusualMovement: string;
  unusualMovementDetail: string;
  sector: string;
  time: string;
  stage: string;
  transactionId: string;
  linkedEntity: string;
  suspiciousIndicators: string;
  flowStages: string;
  selectStage: string;
  sourceCoverage: string;
  sourceCoverageNote: string;
  coverageZeroNote: string;
  noMatchedTransfers: string;
  sourceFile: string;
  sourceFiles: string;
  volumeByFile: string;
  rowsUnit: string;
  filesUnit: string;
  transfersUnit: string;
  extraction: string;
  quality: string;
  description: string;
  rowsAnalysed: string;
  block: string;
  auditChainTitle: string;
  auditChainNote: string;
  allLayers: string;
  showAllLayers: string;
  hideAllLayers: string;
  layerIncidents: string;
  layerRiskAreas: string;
  layerTowers: string;
  layerEntities: string;
  layerTrails: string;
  layerCalls: string;
  movementTrail: string;
  entityLocationsLabel: string;
  incidentMarkersLabel: string;
  riskAreasLabel: string;
  cellTowersLabel: string;
  callLocationsLabel: string;
  movementTrailsLabel: string;
  timeSlider: string;
  allDay: string;
  morning: string;
  afternoon: string;
  evening: string;
  night: string;
  noEventsInWindow: string;
  expandNetworkHint: string;
  relationship: string;
  dateFrom: string;
  dateTo: string;
  last7Days: string;
  last30Days: string;
  last90Days: string;
  anyDate: string;
  graphLegend: string;
  edgeCalled: string;
  edgePaid: string;
  edgeVisited: string;
  edgeAssociated: string;
  edgeRegistered: string;
  edgeLinked: string;
  nodeSelected: string;
  entityDrawerTitle: string;
  viewTimelineAction: string;
  expandNetworkAction: string;
  openCasesAction: string;
  traceMoneyAction: string;
  viewOnMapAction: string;
  linkedCasesLabel: string;
  phoneNumbersLabel: string;
  bankAccountsLabel: string;
  associatesLabel: string;
  locationsLabel: string;
  vehiclesLabel: string;
  confidenceScore: string;
  candidateMatches: string;
  linkedEntityLabel: string;
  linkedCaseLabel: string;
  demoDataLabel: string;
  faceGalleryNote: string;
  matchConfirmed: string;
  matchProbable: string;
  matchUnverified: string;
  matchRejected: string;
  confirmMatch: string;
  rejectMatch: string;
  matchedWith: string;
  matchedFrom: string;
  similarityLabel: string;
  faceComparisonTitle: string;
  referenceImage: string;
  captureImage: string;
  noComparison: string;
  decidedByLabel: string;
  decidedAtLabel: string;
  faceAlertTitle: string;
  faceAlertBody: string;
  decisionRecorded: string;
  decisionFailed: string;
  cameraLabel: string;
  capturedLabel: string;
  caseSummary: string;
  keyEntities: string;
  riskIndicators: string;
  investigationTimeline: string;
  recentActivity: string;
  caseStatus: string;
  caseRisk: string;
  entitiesMetric: string;
  relationshipsMetric: string;
  tracedMetric: string;
  linkedCasesMetric: string;
  evidenceTab: string;
  networkTab: string;
  cdrTab: string;
  moneyTrailTab: string;
  timelineTab: string;
  reportsTab: string;
  exportCaseSummary: string;
  exportEntities: string;
  exportEvidence: string;
  exportTimeline: string;
  exportCenterDescription: string;
  caseNotFound: string;
  backToCases: string;
  searchCases: string;
  caseList: string;
  openCase: string;
  priority: string;
  station: string;
  category: string;
  progressLabel: string;
  evidenceCountLabel: string;
  leadOfficerLabel: string;
  openedLabel: string;
  updatedLabel: string;
  allCases: string;
  activeOnly: string;
  noCasesMatch: string;
  noCasesMatchBody: string;
  entitySearchPlaceholder: string;
  entityKindFilter: string;
  entityRiskFilter: string;
  entityCount: string;
  noEntitiesMatch: string;
  noEntitiesMatchBody: string;
  viewProfile: string;
  notificationsTitle: string;
  markAllRead: string;
  noNotifications: string;
  unread: string;
  read: string;
  closeNotifications: string;
  profileMenu: string;
  languageToggle: string;
  english: string;
  hindi: string;
  commandPalettePlaceholder: string;
  noCommands: string;
  navigate: string;
  searchRecords: string;
  sections: string;
  records: string;
  pressEnter: string;
  pressEsc: string;
  sidebarSections: string;
  collapse: string;
  expandSidebarLabel: string;
  systemStatusOperational: string;
  roleInspector: string;
  roleSupervisor: string;
  roleAdmin: string;
  roleAuditLogger: string;
  roleInspectorDesc: string;
  roleSupervisorDesc: string;
  roleAdminDesc: string;
  roleAuditLoggerDesc: string;
  searchNoResults: string;
  searchStartTyping: string;
  searchGroupCases: string;
  searchGroupPersons: string;
  searchGroupPhones: string;
  searchGroupAccounts: string;
  searchGroupVehicles: string;
  searchGroupOrganizations: string;
  searchGroupLocations: string;
  openResult: string;
  resultCount: string;
  showingResults: string;
  clearSearch: string;
  closeSearch: string;
  searchShortcut: string;
  notificationsEmpty: string;
  notificationsEmptyBody: string;
  viewNotification: string;
  dismissNotification: string;
  profileRole: string;
  profileStation: string;
  profileBadge: string;
  languageEnglish: string;
  languageHindi: string;
  switchToHindi: string;
  switchToEnglish: string;
  currentLanguage: string;
  demoNotice: string;
  demoNoticeBody: string;
  dismiss: string;
  loadingRecords: string;
  loadingGraph: string;
  loadingMap: string;
  loadingFlow: string;
  loadingCase: string;
  loadingEntity: string;
  loadingEvidence: string;
  loadingAudit: string;
  loadingCdr: string;
  loadingMoney: string;
  loadingNetwork: string;
  loadingFace: string;
  loadingAi: string;
  loadingSecurity: string;
  loadingCommandCenter: string;
  loadingCases: string;
  loadingEntities: string;
  loadingReports: string;
  loadingTimeline: string;
  loadingConnections: string;
  loadingCommunications: string;
  loadingFinancial: string;
  loadingLocations: string;
  loadingOverview: string;
  loadingInsights: string;
  loadingFeed: string;
  loadingMetrics: string;
  loadingMarkers: string;
  loadingNodes: string;
  loadingStages: string;
  loadingTransactions: string;
  loadingEvents: string;
  loadingItems: string;
  loadingMatches: string;
  loadingPrompts: string;
  loadingSuggestions: string;
  loadingResults: string;
  loadingSections: string;
  loadingRecordsLabel: string;
  loadingGraphLabel: string;
  loadingMapLabel: string;
  loadingFlowLabel: string;
  loadingCaseLabel: string;
  loadingEntityLabel: string;
  loadingEvidenceLabel: string;
  loadingAuditLabel: string;
  loadingCdrLabel: string;
  loadingMoneyLabel: string;
  loadingNetworkLabel: string;
  loadingFaceLabel: string;
  loadingAiLabel: string;
  loadingSecurityLabel: string;
  loadingCommandCenterLabel: string;
  loadingCasesLabel: string;
  loadingEntitiesLabel: string;
  loadingReportsLabel: string;
  loadingTimelineLabel: string;
  loadingConnectionsLabel: string;
  loadingCommunicationsLabel: string;
  loadingFinancialLabel: string;
  loadingLocationsLabel: string;
  loadingOverviewLabel: string;
  loadingInsightsLabel: string;
  loadingFeedLabel: string;
  loadingMetricsLabel: string;
  loadingMarkersLabel: string;
  loadingNodesLabel: string;
  loadingStagesLabel: string;
  loadingTransactionsLabel: string;
  loadingEventsLabel: string;
  loadingItemsLabel: string;
  loadingMatchesLabel: string;
  loadingPromptsLabel: string;
  loadingSuggestionsLabel: string;
  loadingResultsLabel: string;
  loadingSectionsLabel: string;
  entityId: string;
  name: string;
  caseIdHeader: string;
  titleHeader: string;
  matchIdHeader: string;
  subjectHeader: string;
  ipHeader: string;
  casesTitle: string;
  cdrTitle: string;
  faceTitle: string;
  securityTitle: string;
  biometricReview: string;
  chainTitle: string;
  auditChainHeading: string;
  casesDescription: string;
  cdrDescriptionText: string;
  faceDescriptionText: string;
  securityDescriptionText: string;
  riskCritical: string;
  riskHigh: string;
  riskMedium: string;
  riskLow: string;
  typeVoice: string;
  typeSms: string;
  typeData: string;
  flaggedOnly: string;
  yes: string;
  no: string;
  reviewQueue: string;
  totalMatches: string;
  needsReview: string;
  selectMatch: string;
  chainVerifiedLabel: string;
  auditTimelineNote: string;
  auditInspectorAccessedCase: string;
  auditCrossStationSearch: string;
  auditEvidenceIntegrityVerified: string;
  auditExportAttemptBlocked: string;
  recordsLabel: string;
  matchesLabel: string;
  eventsLabel: string;
  openLabel: string;
  exportRegister: string;
  keyEvents: string;
  displayName: string;
  emailOrBadge: string;
  password: string;
  signInTitle: string;
  signInSubtitle: string;
  jurisdiction: string;
  signInCta: string;
  sessionNotice: string;
  forbiddenTitle: string;
  forbiddenBody: string;
  forbiddenCaseBody: string;
  backToDashboard: string;
  readOnlyAccess: string;
  writeRestricted: string;
  createCaseRestricted: string;
  newCase: string;
  stationLockedNote: string;
  caseIntake: string;
  caseIntakeHint: string;
  firNumber: string;
  firNumberHint: string;
  firs: string;
  caseTitle: string;
  caseDescription: string;
  registerCase: string;
  caseRegistered: string;
  addEvidence: string;
  chooseFiles: string;
  noFilesSelected: string;
  startRun: string;
  appendRun: string;
  runInProgress: string;
  runCompleted: string;
  runFailed: string;
  filesQueued: string;
  graphAnalytics: string;
  analyticsHint: string;
  centrality: string;
  centralityHelp: string;
  communities: string;
  componentsLabel: string;
  multiHop: string;
  pathsHelp: string;
  riskZones: string;
  riskBand: string;
  betweenness: string;
  closeness: string;
  degree: string;
  eigenvector: string;
  nodeCount: string;
  edgeCount: string;
  rankedByBetweenness: string;
  rankedByConfidence: string;
  rankedByRisk: string;
  hops: string;
  inferred: string;
  mostly: string;
  density: string;
  internalLinks: string;
  nodesUnit: string;
  mainCluster: string;
  smallClusters: string;
  isolated: string;
  investigation: string;
  candidate: string;
  suspectsLabel: string;
}

const en: UiStrings = {
  searchPlaceholder: "Search case, person, phone, account, vehicle...",
  searchHint: "Type at least 2 characters",
  notifications: "Notifications",
  profile: "Profile",
  signOut: "Sign out",
  language: "Language",
  systemStatus: "System Status",
  collapseSidebar: "Collapse sidebar",
  expandSidebar: "Expand sidebar",
  commandPalette: "Command palette",
  commandPaletteHint: "Jump to a section or search records",
  noResults: "No matching records",
  loading: "Loading",
  viewAll: "View all",
  openRecord: "Open record",
  viewCase: "Open case",
  close: "Close",
  filters: "Filters",
  reset: "Reset",
  apply: "Apply",
  all: "All",
  risk: "Risk",
  status: "Status",
  district: "District",
  updated: "Updated",
  opened: "Opened",
  leadOfficer: "Lead Officer",
  evidence: "Evidence",
  linkedCases: "Linked Cases",
  progress: "Progress",
  overview: "Overview",
  timeline: "Timeline",
  network: "Network",
  reports: "Reports",
  entities: "Entities",
  identifiers: "Identifiers",
  attributes: "Attributes",
  tags: "Tags",
  firstSeen: "First Seen",
  lastSeen: "Last Seen",
  confidence: "Confidence",
  camera: "Camera",
  captured: "Captured",
  matchStatus: "Match Status",
  integrity: "Integrity",
  custody: "Chain of Custody",
  collectedBy: "Collected By",
  storageRef: "Storage Ref",
  hash: "Hash",
  size: "Size",
  actor: "Actor",
  action: "Action",
  target: "Target",
  severity: "Severity",
  chain: "Chain",
  askAnalyst: "Ask the AI Investigator",
  askPlaceholder: "Ask about this case, entity or evidence...",
  send: "Send",
  insights: "Insights",
  citations: "Citations",
  suggestedPrompts: "Suggested prompts",
  totalVolume: "Total Volume",
  flaggedVolume: "Flagged Volume",
  accounts: "Accounts",
  transactions: "Transactions",
  channel: "Channel",
  amount: "Amount",
  from: "From",
  to: "To",
  occurred: "Occurred",
  note: "Note",
  caller: "Caller",
  callee: "Callee",
  duration: "Duration",
  cellTower: "Cell Tower",
  type: "Type",
  flagged: "Flagged",
  totalCalls: "Total Calls",
  uniqueNumbers: "Unique Numbers",
  flaggedCalls: "Flagged Calls",
  nightCalls: "Night Calls",
  topContacts: "Top Contacts",
  hourlyDistribution: "Hourly Distribution",
  markers: "Markers",
  links: "Links",
  legend: "Legend",
  selectMarker: "Select a marker to inspect",
  noSelection: "Nothing selected",
  emptyTitle: "No records match the current filters",
  emptyBody: "Adjust or clear the filters to see results.",
  clearFilters: "Clear filters",
  showing: "Showing",
  of: "of",
  results: "results",
  page: "Page",
  previous: "Previous",
  next: "Next",
  demoDataNotice:
    "All identities and records are fictional demonstration data.",
  commandCenter: "Command Center",
  commandCenterSubtitle:
    "Unified criminal intelligence and investigation overview",
  activeCases: "Active Cases",
  entitiesIdentified: "Entities Identified",
  relationships: "Relationships",
  highRiskNetworks: "High-Risk Networks",
  activeInvestigations: "Active Investigations",
  liveIntelligenceFeed: "Live Intelligence Feed",
  caseActivity: "Case Activity",
  networkActivity: "Network Activity",
  riskDistribution: "Risk Distribution",
  scopeLabel: "Scope",
  scopeAllCases: "All cases",
  entitiesCenterLabel: "entities",
  caseActivityEmpty: "No activity recorded on this case yet.",
  networkActivityEmpty: "No recorded network events for this case.",
  liveLabel: "Live",
  checkedLabel: "Checked",
  degraded: "Degraded",
  caseWorkbench: "Case Workbench",
  cdr: "CDR",
  moneyTrail: "Money Trail",
  commandMap: "Command Map",
  entityIntelligence: "Entity Intelligence",
  faceIntelligence: "Face Intelligence",
  aiInvestigator: "AI Investigator",
  evidenceVault: "Evidence Vault",
  securityAudit: "Security & Audit",
  connections: "Connections",
  cases: "Cases",
  communications: "Communications",
  financialActivity: "Financial Activity",
  locations: "Locations",
  linkedCasesCount: "Linked Cases",
  phoneNumbers: "Phone Numbers",
  bankAccounts: "Bank Accounts",
  associates: "Associates",
  vehicles: "Vehicles",
  viewTimeline: "View Timeline",
  expandNetwork: "Expand Network",
  openCases: "Open Cases",
  traceMoney: "Trace Money",
  viewOnMap: "View on Map",
  viewOnNetwork: "View on Network",
  viewMoneyTrail: "View Money Trail",
  finding: "Finding",
  evidenceLabel: "Evidence",
  actions: "Actions",
  totalCallsLabel: "Total Calls",
  uniqueNumbersLabel: "Unique Numbers",
  commonNumbers: "Common Numbers",
  anomalies: "Communication Anomalies",
  communicationTimeline: "Communication Timeline",
  tracedAmount: "Traced",
  movementAnalysis: "Movement Analysis",
  layers: "Layers",
  timeOfDay: "Time of Day",
  auditEvents: "Audit Events",
  pendingApprovals: "Pending Approvals",
  securityAlerts: "Security Alerts",
  highRiskUsers: "High-Risk Users",
  auditTimeline: "Audit Timeline",
  integrityVerified: "Integrity Verified",
  evidenceId: "Evidence ID",
  caseLabel: "Case",
  uploadedBy: "Uploaded By",
  timestamp: "Timestamp",
  entityType: "Entity Type",
  relationshipType: "Relationship Type",
  caseFilter: "Case",
  riskLevel: "Risk Level",
  dateRange: "Date Range",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Fit India",
  focusNode: "Focus node",
  expand: "Expand network",
  incidentMarkers: "Incident Markers",
  riskAreas: "H3 Risk Areas",
  cellTowers: "Cell Towers",
  entityLocations: "Entity Locations",
  movementTrails: "Movement Trails",
  callLocations: "Call-Related Locations",
  allEntities: "All Entities",
  entityList: "Entity List",
  openProfile: "Open profile",
  searchEntities: "Search entities...",
  linkAnalysis: "Link Analysis",
  networkDescription:
    "Entity relationship graph for the Nightfall network. Select a node to inspect the linked profile.",
  geospatialIntelligence: "Geospatial Intelligence",
  mapDescription:
    "Pipeline risk zones, incidents and geocoded entity positions for the case scope selected below. Select a marker to inspect its context.",
  caseScope: "Case scope",
  telecomAnalysis: "Telecom Analysis",
  cdrDescription:
    "Call detail records for the Nightfall network, with night-window and flagged-call detection.",
  financialIntelligence: "Financial Intelligence",
  moneyTrailDescription:
    "Account-to-account transfers where every rupee names its source bank file, row narration and SHA-256 — the traced total is exactly the sum of the transfers listed below.",
  integrityAccess: "Integrity & Access",
  securityDescription:
    "Hash-chained audit log of every access and action, with severity classification and chain verification.",
  evidenceManagement: "Evidence Management",
  evidenceDescription:
    "Evidence items with hash-verified integrity status and full chain-of-custody history.",
  analystAssistant: "Analyst Assistant",
  aiDescription:
    "Structured insights and a conversational interface over the case record. The assistant is a frontend demonstration and is not connected to a live model.",
  entityProfile: "Entity Profile",
  entityDescription:
    "Consolidated profile with connections, cases, communications, financial activity and locations.",
  caseWorkbenchDescription:
    "Unified case record with evidence, network, CDR, money trail and timeline views.",
  caseRegistry: "Case Registry",
  caseRegistryDescription:
    "All registered cases with status, risk and linked intelligence.",
  biometricIntelligence: "Biometric Intelligence",
  faceDescription:
    "Candidate face matches against the watchlist gallery. All matches are fictional demonstration data.",
  record: "Record",
  started: "Started",
  item: "Item",
  collected: "Collected",
  txn: "Txn",
  event: "Event",
  ipAddress: "IP Address",
  previousHash: "Previous Hash",
  role: "Role",
  markerType: "Marker Type",
  linkedMarkers: "Linked Markers",
  mapLayerSchematic: "Map layer: schematic",
  mapSchematicNote:
    "Positions are schematic placeholders for demonstration; no live geospatial tiles are used.",
  vaultIntegrityOverview: "Vault Integrity Overview",
  chainVerified: "Chain verified",
  chainVerifiedDetail:
    "Each entry follows the previous one in a stable, append-only sequence",
  demoModeNoModel: "Retrieval only — no language model",
  howDerived: "How this was developed",
  generationLabel: "Generated from",
  runLabel: "Run",
  supportingLabel: "supporting",
  contradictingLabel: "contradicting",
  alternativesLabel: "alternatives",
  noModelAnswer:
    "No language model is connected to this workstation. Answers come only from indexed case records — try an entity name, a case id, or “hypotheses”.",
  replyInsights: "Matched hypotheses in the indexed record:",
  replyEntities: "Matched entities:",
  replyEvidence: "Matched evidence records:",
  nullHypothesisLabel: "Null hypothesis",
  askPromptHypotheses: "Show the strongest hypotheses",
  askPromptHighRisk: "List high-risk entities",
  askPromptEvidence: "What evidence does this case hold?",
  analyst: "Analyst",
  aiInvestigatorName: "AI Investigator",
  refresh: "Refresh",
  operational: "Operational",
  noLinkedEntities: "No linked entities",
  noLinkedEntitiesBody: "This entity has no recorded connections.",
  noLinkedCases: "No linked cases",
  noCustodyEvents: "No custody events recorded for this item.",
  selectRecord: "Select a record to inspect its details.",
  selectTransaction: "Select a transaction to inspect it.",
  selectAuditEvent: "Select an audit event to inspect it.",
  selectEvidence: "Select an evidence item to inspect it.",
  entityNotFound: "Entity not found",
  backToEntities: "Back to entities",
  quickView: "Quick view",
  openFullProfile: "Open full profile",
  entityQuickView: "Entity Quick View",
  linkedCounts: "Linked Counts",
  casesCount: "Cases",
  phonesCount: "Phones",
  accountsCount: "Accounts",
  locationsCount: "Locations",
  vehiclesCount: "Vehicles",
  totalItems: "Total Items",
  verified: "Verified",
  integrityFlags: "Integrity Flags",
  flaggedEvents: "Flagged Events",
  chainIntegrity: "Chain Integrity",
  volumeByChannel: "Volume by Channel",
  noChannelData: "No payment channel recorded for these rows.",
  accountFlowGraph: "Account Flow Graph",
  lineThicknessNote: "Line thickness reflects transaction amount",
  callsGroupedNote: "Calls grouped into 3-hour windows",
  movementSequence: "Movement Sequence",
  unusualMovement: "Unusual movement sequence detected",
  unusualMovementDetail:
    "E-10482 moved through four sectors in a single day with no recorded appointments, deviating from the established pattern.",
  sector: "Sector",
  time: "Time",
  stage: "Stage",
  transactionId: "Transaction ID",
  linkedEntity: "Linked Entity",
  suspiciousIndicators: "Suspicious Indicators",
  flowStages: "Flow Stages",
  selectStage: "Select a stage to inspect the transaction.",
  sourceCoverage: "Source coverage",
  sourceCoverageNote:
    "Every rupee in the traced total is the sum of the transfers below — each tied to a hashed bank source file, its rows and its integrity verdict.",
  coverageZeroNote:
    "Files showing 0 transfers were read and quality-screened in full — their rows contain no resolved account-to-account transfer (cash withdrawals, unknown counterparties, one-sided entries), so they contribute rows but no rupees.",
  noMatchedTransfers: "No matched transfers",
  sourceFile: "Source file",
  sourceFiles: "Source files",
  volumeByFile: "Volume by Source File",
  rowsUnit: "rows",
  filesUnit: "files",
  transfersUnit: "transfers",
  extraction: "Extraction",
  quality: "Quality",
  description: "Description",
  rowsAnalysed: "Rows analysed",
  block: "Block",
  auditChainTitle: "Audit Chain",
  auditChainNote: "Each entry commits to the hash of the previous entry",
  allLayers: "All Layers",
  showAllLayers: "Show all",
  hideAllLayers: "Hide all",
  layerIncidents: "Incident Markers",
  layerRiskAreas: "H3 Risk Areas",
  layerTowers: "Cell Towers",
  layerEntities: "Entity Locations",
  layerTrails: "Movement Trails",
  layerCalls: "Call-Related Locations",
  movementTrail: "Movement Trail",
  entityLocationsLabel: "Entity Locations",
  incidentMarkersLabel: "Incident Markers",
  riskAreasLabel: "H3 Risk Areas",
  cellTowersLabel: "Cell Towers",
  callLocationsLabel: "Call-Related Locations",
  movementTrailsLabel: "Movement Trails",
  timeSlider: "Time of Day",
  allDay: "All day",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  noEventsInWindow: "No events in this time window",
  expandNetworkHint: "Double-click a node or use the expand control",
  relationship: "Relationship",
  dateFrom: "From",
  dateTo: "To",
  last7Days: "Last 7 days",
  last30Days: "Last 30 days",
  last90Days: "Last 90 days",
  anyDate: "Any date",
  graphLegend: "Graph Legend",
  edgeCalled: "Called",
  edgePaid: "Paid",
  edgeVisited: "Visited",
  edgeAssociated: "Associated",
  edgeRegistered: "Registered",
  edgeLinked: "Linked",
  nodeSelected: "Node selected",
  entityDrawerTitle: "Entity Intelligence",
  viewTimelineAction: "View Timeline",
  expandNetworkAction: "Expand Network",
  openCasesAction: "Open Cases",
  traceMoneyAction: "Trace Money",
  viewOnMapAction: "View on Map",
  linkedCasesLabel: "Linked Cases",
  phoneNumbersLabel: "Phone Numbers",
  bankAccountsLabel: "Bank Accounts",
  associatesLabel: "Associates",
  locationsLabel: "Locations",
  vehiclesLabel: "Vehicles",
  confidenceScore: "Confidence",
  candidateMatches: "Candidate Matches",
  linkedEntityLabel: "Linked Entity",
  linkedCaseLabel: "Linked Case",
  demoDataLabel: "Demo data",
  faceGalleryNote:
    "All candidate matches are fictional demonstration data. No real biometric matching is performed.",
  matchConfirmed: "Confirmed",
  matchProbable: "Probable",
  matchUnverified: "Unverified",
  matchRejected: "Rejected",
  confirmMatch: "Confirm match",
  rejectMatch: "Reject match",
  matchedWith: "Matched with",
  matchedFrom: "Matched from",
  similarityLabel: "Similarity",
  faceComparisonTitle: "Face comparison",
  referenceImage: "Reference",
  captureImage: "Capture",
  noComparison: "No counterpart face on record.",
  decidedByLabel: "Decided by",
  decidedAtLabel: "Decided at",
  faceAlertTitle: "Face match awaiting review",
  faceAlertBody:
    "An identity candidate links a CCTV frame to a known subject. Confirm or reject it to record the investigator decision.",
  decisionRecorded: "Decision recorded",
  decisionFailed: "Decision could not be saved",
  cameraLabel: "Camera",
  capturedLabel: "Captured",
  caseSummary: "Case Summary",
  keyEntities: "Key Entities",
  riskIndicators: "Risk Indicators",
  investigationTimeline: "Investigation Timeline",
  recentActivity: "Recent Activity",
  caseStatus: "Status",
  caseRisk: "Risk",
  entitiesMetric: "Entities",
  relationshipsMetric: "Relationships",
  tracedMetric: "Traced",
  linkedCasesMetric: "Linked Cases",
  evidenceTab: "Evidence",
  networkTab: "Network",
  cdrTab: "CDR",
  moneyTrailTab: "Money Trail",
  timelineTab: "Timeline",
  reportsTab: "Reports",
  exportCaseSummary: "Case summary",
  exportEntities: "Entities",
  exportEvidence: "Evidence",
  exportTimeline: "Timeline",
  exportCenterDescription:
    "Download this case's records as CSV. Each export contains only the data shown on this page.",
  caseNotFound: "Case not found",
  backToCases: "Back to cases",
  searchCases: "Search cases...",
  caseList: "Case List",
  openCase: "Open case",
  priority: "Priority",
  station: "Station",
  category: "Category",
  progressLabel: "Progress",
  evidenceCountLabel: "Evidence",
  leadOfficerLabel: "Lead Officer",
  openedLabel: "Opened",
  updatedLabel: "Updated",
  allCases: "All Cases",
  activeOnly: "Active only",
  noCasesMatch: "No cases match the current filters",
  noCasesMatchBody: "Adjust or clear the filters to see results.",
  entitySearchPlaceholder: "Search entities...",
  entityKindFilter: "Entity Type",
  entityRiskFilter: "Risk Level",
  entityCount: "Entities",
  noEntitiesMatch: "No entities match the current filters",
  noEntitiesMatchBody: "Adjust or clear the filters to see results.",
  viewProfile: "View profile",
  notificationsTitle: "Notifications",
  markAllRead: "Mark all read",
  noNotifications: "No notifications",
  unread: "Unread",
  read: "Read",
  closeNotifications: "Close notifications",
  profileMenu: "Profile menu",
  languageToggle: "Language",
  english: "English",
  hindi: "Hindi",
  commandPalettePlaceholder: "Jump to a section or search records...",
  noCommands: "No matching commands",
  navigate: "Navigate",
  searchRecords: "Search records",
  sections: "Sections",
  records: "Records",
  pressEnter: "Enter",
  pressEsc: "Esc",
  sidebarSections: "Sections",
  collapse: "Collapse",
  expandSidebarLabel: "Expand sidebar",
  systemStatusOperational: "All Intelligence Services Operational",
  roleInspector: "Inspector",
  roleSupervisor: "Supervisor",
  roleAdmin: "Administrator",
  roleAuditLogger: "Audit Logger",
  roleInspectorDesc: "Assigned cases and personal workload",
  roleSupervisorDesc: "Team caseload and approvals",
  roleAdminDesc: "System metrics and access management",
  roleAuditLoggerDesc: "Audit trail and chain integrity",
  searchNoResults: "No matching records",
  searchStartTyping: "Type at least 2 characters",
  searchGroupCases: "Cases",
  searchGroupPersons: "Persons",
  searchGroupPhones: "Phones",
  searchGroupAccounts: "Accounts",
  searchGroupVehicles: "Vehicles",
  searchGroupOrganizations: "Organizations",
  searchGroupLocations: "Locations",
  openResult: "Open",
  resultCount: "Results",
  showingResults: "Showing",
  clearSearch: "Clear search",
  closeSearch: "Close search",
  searchShortcut: "Search",
  notificationsEmpty: "No notifications",
  notificationsEmptyBody: "You are all caught up.",
  viewNotification: "View",
  dismissNotification: "Dismiss",
  profileRole: "Role",
  profileStation: "Station",
  profileBadge: "Badge",
  languageEnglish: "English",
  languageHindi: "Hindi",
  switchToHindi: "हिन्दी",
  switchToEnglish: "English",
  currentLanguage: "Current language",
  demoNotice: "Demo data",
  demoNoticeBody:
    "All identities and records in this application are fictional demonstration data.",
  dismiss: "Dismiss",
  loadingRecords: "Loading records",
  loadingGraph: "Loading graph",
  loadingMap: "Loading map",
  loadingFlow: "Loading flow",
  loadingCase: "Loading case",
  loadingEntity: "Loading entity",
  loadingEvidence: "Loading evidence",
  loadingAudit: "Loading audit log",
  loadingCdr: "Loading call records",
  loadingMoney: "Loading money trail",
  loadingNetwork: "Loading network",
  loadingFace: "Loading matches",
  loadingAi: "Loading assistant",
  loadingSecurity: "Loading security data",
  loadingCommandCenter: "Loading command center",
  loadingCases: "Loading cases",
  loadingEntities: "Loading entities",
  loadingReports: "Loading reports",
  loadingTimeline: "Loading timeline",
  loadingConnections: "Loading connections",
  loadingCommunications: "Loading communications",
  loadingFinancial: "Loading financial activity",
  loadingLocations: "Loading locations",
  loadingOverview: "Loading overview",
  loadingInsights: "Loading insights",
  loadingFeed: "Loading feed",
  loadingMetrics: "Loading metrics",
  loadingMarkers: "Loading markers",
  loadingNodes: "Loading nodes",
  loadingStages: "Loading stages",
  loadingTransactions: "Loading transactions",
  loadingEvents: "Loading events",
  loadingItems: "Loading items",
  loadingMatches: "Loading matches",
  loadingPrompts: "Loading prompts",
  loadingSuggestions: "Loading suggestions",
  loadingResults: "Loading results",
  loadingSections: "Loading sections",
  loadingRecordsLabel: "records",
  loadingGraphLabel: "graph",
  loadingMapLabel: "map",
  loadingFlowLabel: "flow",
  loadingCaseLabel: "case",
  loadingEntityLabel: "entity",
  loadingEvidenceLabel: "evidence",
  loadingAuditLabel: "audit",
  loadingCdrLabel: "cdr",
  loadingMoneyLabel: "money",
  loadingNetworkLabel: "network",
  loadingFaceLabel: "face",
  loadingAiLabel: "ai",
  loadingSecurityLabel: "security",
  loadingCommandCenterLabel: "command center",
  loadingCasesLabel: "cases",
  loadingEntitiesLabel: "entities",
  loadingReportsLabel: "reports",
  loadingTimelineLabel: "timeline",
  loadingConnectionsLabel: "connections",
  loadingCommunicationsLabel: "communications",
  loadingFinancialLabel: "financial",
  loadingLocationsLabel: "locations",
  loadingOverviewLabel: "overview",
  loadingInsightsLabel: "insights",
  loadingFeedLabel: "feed",
  loadingMetricsLabel: "metrics",
  loadingMarkersLabel: "markers",
  loadingNodesLabel: "nodes",
  loadingStagesLabel: "stages",
  loadingTransactionsLabel: "transactions",
  loadingEventsLabel: "events",
  loadingItemsLabel: "items",
  loadingMatchesLabel: "matches",
  loadingPromptsLabel: "prompts",
  loadingSuggestionsLabel: "suggestions",
  loadingResultsLabel: "results",
  loadingSectionsLabel: "sections",
  entityId: "Entity ID",
  name: "Name",
  caseIdHeader: "Case ID",
  titleHeader: "Title",
  matchIdHeader: "Match ID",
  subjectHeader: "Subject",
  ipHeader: "IP",
  casesTitle: "Cases",
  cdrTitle: "CDR Analysis",
  faceTitle: "Face Intelligence",
  securityTitle: "Security & Audit",
  biometricReview: "Biometric Review",
  chainTitle: "Chain",
  auditChainHeading: "Audit Chain",
  casesDescription:
    "Every registered case with status, priority, risk assessment and assigned lead officer.",
  cdrDescriptionText:
    "Call detail records for the Nightfall network, with night-window and flagged-call detection.",
  faceDescriptionText:
    "Camera match review queue. Confidence and similarity scores come from the pipeline's face embeddings; confirm or reject a candidate to record the investigator decision.",
  securityDescriptionText:
    "Append-only audit log of every access and action, with severity classification and sequence verification.",
  riskCritical: "Critical",
  riskHigh: "High",
  riskMedium: "Medium",
  riskLow: "Low",
  typeVoice: "Voice",
  typeSms: "SMS",
  typeData: "Data",
  flaggedOnly: "Flagged only",
  yes: "Yes",
  no: "No",
  reviewQueue: "Review queue",
  totalMatches: "Total Matches",
  needsReview: "Needs Review",
  selectMatch: "Select a match to inspect it.",
  chainVerifiedLabel: "Chain verified",
  auditTimelineNote: "Most recent access and action events",
  auditInspectorAccessedCase: "Inspector accessed Case",
  auditCrossStationSearch: "Cross-station search requested",
  auditEvidenceIntegrityVerified: "Evidence integrity verified",
  auditExportAttemptBlocked: "Export attempt blocked",
  recordsLabel: "records",
  matchesLabel: "matches",
  eventsLabel: "events",
  openLabel: "Open",
  exportRegister: "Export register",
  keyEvents: "key events",
  displayName: "Display Name",
  emailOrBadge: "Email or badge ID",
  password: "Password",
  signInTitle: "Sign in to CrimeNet",
  signInSubtitle:
    "Sign in with your CrimeNet account. Your role and station are read from the signed access token — there is no role picker.",
  jurisdiction: "Jurisdiction",
  signInCta: "Sign in",
  sessionNotice:
    "Your access level and station come from the token issued after authentication.",
  forbiddenTitle: "403 — Access restricted",
  forbiddenBody:
    "Your account's role does not have permission to open this section. Ask an administrator if you need access.",
  forbiddenCaseBody:
    "Your access level on this case is too low to open it. Ask a supervisor or administrator for case access.",
  backToDashboard: "Back to Command Center",
  readOnlyAccess: "Read-only access",
  writeRestricted:
    "Your access level does not allow evidence uploads or pipeline runs.",
  createCaseRestricted:
    "Case registration is limited to supervisors and administrators.",
  newCase: "New case",
  stationLockedNote: "Supervisors register cases only in their own station.",
  caseIntake: "Case Intake",
  caseIntakeHint:
    "Register an FIR, attach its evidence, then run the pipeline over it.",
  firNumber: "FIR Number",
  firs: "FIRs",
  firNumberHint:
    "Exactly as written on the report; the system issues its own sequential id.",
  caseTitle: "Case Title",
  caseDescription: "Description",
  registerCase: "Register case",
  caseRegistered: "Case registered",
  addEvidence: "Evidence files",
  chooseFiles: "Choose files",
  noFilesSelected: "No files selected",
  startRun: "Run pipeline",
  appendRun: "Append and re-run",
  runInProgress: "Running",
  runCompleted: "Completed",
  runFailed: "Failed",
  filesQueued: "files queued",
  graphAnalytics: "Graph Analytics",
  analyticsHint:
    "Who bridges the network, which clusters formed, and where risk concentrates — straight from the pipeline run.",
  centrality: "Centrality",
  centralityHelp:
    "Degree counts direct links. Betweenness is the share of shortest paths crossing this node — high values are bridges. Closeness is how near it sits to every other node. Eigenvector rewards links to other well-linked nodes.",
  communities: "Communities",
  componentsLabel: "Components",
  multiHop: "Multi-hop paths",
  pathsHelp:
    "Inferred routes through intermediate nodes. Confidence multiplies the edge confidences along the route — treat low values as leads to verify, not facts.",
  riskZones: "Risk zones",
  riskBand: "Risk band",
  betweenness: "Betweenness",
  closeness: "Closeness",
  degree: "Degree",
  eigenvector: "Eigenvector",
  nodeCount: "Nodes",
  edgeCount: "Edges",
  rankedByBetweenness: "ranked by betweenness",
  rankedByConfidence: "ranked by confidence",
  rankedByRisk: "ranked by risk score",
  hops: "hops",
  inferred: "Inferred",
  mostly: "mostly",
  density: "Density",
  internalLinks: "internal links",
  nodesUnit: "nodes",
  mainCluster: "Main cluster",
  smallClusters: "small clusters",
  isolated: "isolated",
  investigation: "Investigation",
  candidate: "Candidate",
  suspectsLabel: "Suspects",
};

const hi: UiStrings = {
  searchPlaceholder: "केस, व्यक्ति, फ़ोन, खाता, वाहन खोजें...",
  searchHint: "कम से कम 2 अक्षर लिखें",
  notifications: "सूचनाएँ",
  profile: "प्रोफ़ाइल",
  signOut: "साइन आउट",
  language: "भाषा",
  systemStatus: "सिस्टम स्थिति",
  collapseSidebar: "साइडबार छोटा करें",
  expandSidebar: "साइडबार बड़ा करें",
  commandPalette: "कमांड पैलेट",
  commandPaletteHint: "किसी अनुभाग पर जाएँ या रिकॉर्ड खोजें",
  noResults: "कोई मेल खाता रिकॉर्ड नहीं",
  loading: "लोड हो रहा है",
  viewAll: "सभी देखें",
  openRecord: "रिकॉर्ड खोलें",
  viewCase: "केस खोलें",
  close: "बंद करें",
  filters: "फ़िल्टर",
  reset: "रीसेट",
  apply: "लागू करें",
  all: "सभी",
  risk: "जोखिम",
  status: "स्थिति",
  district: "ज़िला",
  updated: "अद्यतन",
  opened: "खोला गया",
  leadOfficer: "प्रमुख अधिकारी",
  evidence: "साक्ष्य",
  linkedCases: "संबंधित मामले",
  progress: "प्रगति",
  overview: "अवलोकन",
  timeline: "समयरेखा",
  network: "नेटवर्क",
  reports: "रिपोर्ट",
  entities: "इकाइयाँ",
  identifiers: "पहचानकर्ता",
  attributes: "विशेषताएँ",
  tags: "टैग",
  firstSeen: "पहली बार देखा",
  lastSeen: "अंतिम बार देखा",
  confidence: "विश्वास",
  camera: "कैमरा",
  captured: "कैप्चर",
  matchStatus: "मिलान स्थिति",
  integrity: "अखंडता",
  custody: "अभिरक्षा श्रृंखला",
  collectedBy: "एकत्र किया",
  storageRef: "भंडारण संदर्भ",
  hash: "हैश",
  size: "आकार",
  actor: "कर्ता",
  action: "क्रिया",
  target: "लक्ष्य",
  severity: "गंभीरता",
  chain: "श्रृंखला",
  askAnalyst: "एआई अन्वेषक से पूछें",
  askPlaceholder: "इस केस, इकाई या साक्ष्य के बारे में पूछें...",
  send: "भेजें",
  insights: "अंतर्दृष्टि",
  citations: "संदर्भ",
  suggestedPrompts: "सुझाए गए प्रश्न",
  totalVolume: "कुल मात्रा",
  flaggedVolume: "चिह्नित मात्रा",
  accounts: "खाते",
  transactions: "लेनदेन",
  channel: "माध्यम",
  amount: "राशि",
  from: "से",
  to: "को",
  occurred: "हुआ",
  note: "टिप्पणी",
  caller: "कॉलर",
  callee: "प्राप्तकर्ता",
  duration: "अवधि",
  cellTower: "सेल टावर",
  type: "प्रकार",
  flagged: "चिह्नित",
  totalCalls: "कुल कॉल",
  uniqueNumbers: "अद्वितीय नंबर",
  flaggedCalls: "चिह्नित कॉल",
  nightCalls: "रात्रि कॉल",
  topContacts: "शीर्ष संपर्क",
  hourlyDistribution: "प्रति घंटा वितरण",
  markers: "मार्कर",
  links: "लिंक",
  legend: "संकेत",
  selectMarker: "निरीक्षण के लिए मार्कर चुनें",
  noSelection: "कुछ चयनित नहीं",
  emptyTitle: "वर्तमान फ़िल्टर से कोई रिकॉर्ड मेल नहीं खाता",
  emptyBody: "परिणाम देखने के लिए फ़िल्टर बदलें या हटाएँ।",
  clearFilters: "फ़िल्टर हटाएँ",
  showing: "दिखा रहे हैं",
  of: "में से",
  results: "परिणाम",
  page: "पृष्ठ",
  previous: "पिछला",
  next: "अगला",
  demoDataNotice: "सभी पहचान और रिकॉर्ड काल्पनिक प्रदर्शन डेटा हैं।",
  commandCenter: "कमांड सेंटर",
  commandCenterSubtitle: "एकीकृत आपराधिक खुफिया और जाँच अवलोकन",
  activeCases: "सक्रिय मामले",
  entitiesIdentified: "पहचानी गई इकाइयाँ",
  relationships: "संबंध",
  highRiskNetworks: "उच्च-जोखिम नेटवर्क",
  activeInvestigations: "सक्रिय जाँचें",
  liveIntelligenceFeed: "लाइव खुफिया फ़ीड",
  caseActivity: "मामला गतिविधि",
  networkActivity: "नेटवर्क गतिविधि",
  riskDistribution: "जोखिम वितरण",
  scopeLabel: "दायरा",
  scopeAllCases: "सभी मामले",
  entitiesCenterLabel: "इकाइयाँ",
  caseActivityEmpty: "इस मामले में अभी कोई गतिविधि दर्ज नहीं है।",
  networkActivityEmpty: "इस मामले के लिए कोई नेटवर्क घटना दर्ज नहीं है।",
  liveLabel: "लाइव",
  checkedLabel: "जाँच",
  degraded: "क्षतिग्रस्त",
  caseWorkbench: "केस वर्कबेंच",
  cdr: "सीडीआर",
  moneyTrail: "धन मार्ग",
  commandMap: "कमांड मैप",
  entityIntelligence: "इकाई इंटेलिजेंस",
  faceIntelligence: "फेस इंटेलिजेंस",
  aiInvestigator: "एआई अन्वेषक",
  evidenceVault: "साक्ष्य तिजोरी",
  securityAudit: "सुरक्षा और ऑडिट",
  connections: "संबंध",
  cases: "मामले",
  communications: "संचार",
  financialActivity: "वित्तीय गतिविधि",
  locations: "स्थान",
  linkedCasesCount: "संबंधित मामले",
  phoneNumbers: "फ़ोन नंबर",
  bankAccounts: "बैंक खाते",
  associates: "सहयोगी",
  vehicles: "वाहन",
  viewTimeline: "समयरेखा देखें",
  expandNetwork: "नेटवर्क विस्तारित करें",
  openCases: "मामले खोलें",
  traceMoney: "धन का पता लगाएँ",
  viewOnMap: "मैप पर देखें",
  viewOnNetwork: "नेटवर्क पर देखें",
  viewMoneyTrail: "धन मार्ग देखें",
  finding: "निष्कर्ष",
  evidenceLabel: "साक्ष्य",
  actions: "क्रियाएँ",
  totalCallsLabel: "कुल कॉल",
  uniqueNumbersLabel: "अद्वितीय नंबर",
  commonNumbers: "सामान्य नंबर",
  anomalies: "संचार विसंगतियाँ",
  communicationTimeline: "संचार समयरेखा",
  tracedAmount: "पता लगाया",
  movementAnalysis: "गतिविधि विश्लेषण",
  layers: "परतें",
  timeOfDay: "दिन का समय",
  auditEvents: "ऑडिट घटनाएँ",
  pendingApprovals: "लंबित अनुमोदन",
  securityAlerts: "सुरक्षा अलर्ट",
  highRiskUsers: "उच्च-जोखिम उपयोगकर्ता",
  auditTimeline: "ऑडिट समयरेखा",
  integrityVerified: "अखंडता सत्यापित",
  evidenceId: "साक्ष्य आईडी",
  caseLabel: "मामला",
  uploadedBy: "अपलोड किया",
  timestamp: "समय-चिह्न",
  entityType: "इकाई प्रकार",
  relationshipType: "संबंध प्रकार",
  caseFilter: "मामला",
  riskLevel: "जोखिम स्तर",
  dateRange: "दिनांक सीमा",
  zoomIn: "ज़ूम इन",
  zoomOut: "ज़ूम आउट",
  resetView: "भारत में फ़िट करें",
  focusNode: "नोड फ़ोकस करें",
  expand: "नेटवर्क विस्तारित करें",
  incidentMarkers: "घटना मार्कर",
  riskAreas: "एच3 जोखिम क्षेत्र",
  cellTowers: "सेल टावर",
  entityLocations: "इकाई स्थान",
  movementTrails: "गतिविधि पथ",
  callLocations: "कॉल-संबंधित स्थान",
  allEntities: "सभी इकाइयाँ",
  entityList: "इकाई सूची",
  openProfile: "प्रोफ़ाइल खोलें",
  searchEntities: "इकाइयाँ खोजें...",
  linkAnalysis: "लिंक विश्लेषण",
  networkDescription:
    "नाइटफ़ॉल नेटवर्क का इकाई संबंध ग्राफ़। जुड़ी प्रोफ़ाइल देखने के लिए नोड चुनें।",
  geospatialIntelligence: "भू-स्थानिक इंटेलिजेंस",
  mapDescription:
    "नीचे चुने गए केस स्कोप के पाइपलाइन जोखिम क्षेत्र, घटनाएँ और भू-स्थानित इकाई स्थान। संदर्भ देखने के लिए मार्कर चुनें।",
  caseScope: "केस स्कोप",
  telecomAnalysis: "टेलीकॉम विश्लेषण",
  cdrDescription:
    "नाइटफ़ॉल नेटवर्क के कॉल विवरण रिकॉर्ड, रात्रि-विंडो और चिह्नित कॉल पहचान के साथ।",
  financialIntelligence: "वित्तीय इंटेलिजेंस",
  moneyTrailDescription:
    "खाते से खाते में अंतरण जिनमें हर रुपया अपना स्रोत बैंक फ़ाइल, पंक्ति विवरण और SHA-256 बताता है — निगली गई कुल राशि ठीक नीचे सूचीबद्ध अंतरणों का योग है।",
  integrityAccess: "अखंडता और पहुँच",
  securityDescription:
    "प्रत्येक पहुँच और क्रिया का हैश-श्रृंखलित ऑडिट लॉग, गंभीरता वर्गीकरण और श्रृंखला सत्यापन के साथ।",
  evidenceManagement: "साक्ष्य प्रबंधन",
  evidenceDescription:
    "हैश-सत्यापित अखंडता स्थिति और पूर्ण अभिरक्षा-श्रृंखला इतिहास के साथ साक्ष्य आइटम।",
  analystAssistant: "विश्लेषक सहायक",
  aiDescription:
    "केस रिकॉर्ड पर संरचित अंतर्दृष्टि और संवादात्मक इंटरफ़ेस। सहायक एक फ्रंटएंड प्रदर्शन है और लाइव मॉडल से जुड़ा नहीं है।",
  entityProfile: "इकाई प्रोफ़ाइल",
  entityDescription:
    "संबंध, मामले, संचार, वित्तीय गतिविधि और स्थानों के साथ समेकित प्रोफ़ाइल।",
  caseWorkbenchDescription:
    "साक्ष्य, नेटवर्क, सीडीआर, धन मार्ग और समयरेखा दृश्यों के साथ एकीकृत केस रिकॉर्ड।",
  caseRegistry: "केस रजिस्ट्री",
  caseRegistryDescription:
    "स्थिति, जोखिम और जुड़ी खुफिया जानकारी के साथ सभी पंजीकृत मामले।",
  biometricIntelligence: "बायोमेट्रिक इंटेलिजेंस",
  faceDescription:
    "वॉचलिस्ट गैलरी के विरुद्ध संभावित चेहरा मिलान। सभी मिलान काल्पनिक प्रदर्शन डेटा हैं।",
  record: "रिकॉर्ड",
  started: "प्रारंभ",
  item: "आइटम",
  collected: "एकत्रित",
  txn: "लेनदेन",
  event: "घटना",
  ipAddress: "आईपी पता",
  previousHash: "पिछला हैश",
  role: "भूमिका",
  markerType: "मार्कर प्रकार",
  linkedMarkers: "जुड़े मार्कर",
  mapLayerSchematic: "मैप परत: योजनाबद्ध",
  mapSchematicNote:
    "स्थान प्रदर्शन के लिए योजनाबद्ध प्लेसहोल्डर हैं; कोई लाइव भू-स्थानिक टाइल उपयोग नहीं होती।",
  vaultIntegrityOverview: "तिजोरी अखंडता अवलोकन",
  chainVerified: "श्रृंखला सत्यापित",
  chainVerifiedDetail: "प्रत्येक प्रविष्टि स्थिर, केवल-जोड़ अनुक्रम में पिछली के बाद आती है",
  demoModeNoModel: "रिट्रीवल मोड — कोई भाषा मॉडल नहीं",
  howDerived: "यह कैसे विकसित हुआ",
  generationLabel: "स्रोत",
  runLabel: "रन",
  supportingLabel: "समर्थन",
  contradictingLabel: "विरोध",
  alternativesLabel: "विकल्प",
  noModelAnswer:
    "इस वर्कस्टेशन से कोई भाषा मॉडल नहीं जुड़ा है। उत्तर केवल अनुक्रमित मामला रिकॉर्ड से आते हैं — किसी इकाई का नाम, केस आईडी, या “hypotheses” आज़माएँ।",
  replyInsights: "अनुक्रमित रिकॉर्ड में मिली परिकल्पनाएँ:",
  replyEntities: "मिली इकाइयाँ:",
  replyEvidence: "मिले साक्ष्य रिकॉर्ड:",
  nullHypothesisLabel: "शून्य परिकल्पना",
  askPromptHypotheses: "सबसे मज़बूत परिकल्पनाएँ दिखाएँ",
  askPromptHighRisk: "उच्च जोखिम वाली इकाइयाँ सूचीबद्ध करें",
  askPromptEvidence: "इस मामले में क्या साक्ष्य है?",
  analyst: "विश्लेषक",
  aiInvestigatorName: "एआई अन्वेषक",
  refresh: "ताज़ा करें",
  operational: "सक्रिय",
  noLinkedEntities: "कोई जुड़ी इकाई नहीं",
  noLinkedEntitiesBody: "इस इकाई का कोई दर्ज संबंध नहीं है।",
  noLinkedCases: "कोई जुड़ा मामला नहीं",
  noCustodyEvents: "इस आइटम के लिए कोई अभिरक्षा घटना दर्ज नहीं है।",
  selectRecord: "विवरण देखने के लिए रिकॉर्ड चुनें।",
  selectTransaction: "निरीक्षण के लिए लेनदेन चुनें।",
  selectAuditEvent: "निरीक्षण के लिए ऑडिट घटना चुनें।",
  selectEvidence: "निरीक्षण के लिए साक्ष्य आइटम चुनें।",
  entityNotFound: "इकाई नहीं मिली",
  backToEntities: "इकाइयों पर वापस",
  quickView: "त्वरित दृश्य",
  openFullProfile: "पूरी प्रोफ़ाइल खोलें",
  entityQuickView: "इकाई त्वरित दृश्य",
  linkedCounts: "जुड़ी गणनाएँ",
  casesCount: "मामले",
  phonesCount: "फ़ोन",
  accountsCount: "खाते",
  locationsCount: "स्थान",
  vehiclesCount: "वाहन",
  totalItems: "कुल आइटम",
  verified: "सत्यापित",
  integrityFlags: "अखंडता ध्वज",
  flaggedEvents: "चिह्नित घटनाएँ",
  chainIntegrity: "श्रृंखला अखंडता",
  volumeByChannel: "माध्यम अनुसार मात्रा",
  noChannelData: "इन पंक्तियों के लिए कोई भुगतान चैनल दर्ज नहीं है।",
  accountFlowGraph: "खाता प्रवाह ग्राफ़",
  lineThicknessNote: "रेखा की मोटाई लेनदेन राशि दर्शाती है",
  callsGroupedNote: "कॉल 3-घंटे विंडो में समूहित",
  movementSequence: "गतिविधि क्रम",
  unusualMovement: "असामान्य गतिविधि क्रम पाया गया",
  unusualMovementDetail:
    "E-10482 एक ही दिन में चार सेक्टरों से गुज़रा, बिना किसी दर्ज अपॉइंटमेंट के, स्थापित पैटर्न से भटकते हुए।",
  sector: "सेक्टर",
  time: "समय",
  stage: "चरण",
  transactionId: "लेनदेन आईडी",
  linkedEntity: "जुड़ी इकाई",
  suspiciousIndicators: "संदिग्ध संकेतक",
  flowStages: "प्रवाह चरण",
  selectStage: "लेनदेन देखने के लिए चरण चुनें।",
  sourceCoverage: "स्रोत कवरेज",
  sourceCoverageNote:
    "निगली गई कुल राशि का हर रुपया नीचे के अंतरणों का योग है — हर अंतरण एक हैश-युक्त बैंक स्रोत फ़ाइल, उसकी पंक्तियों और अखंडता परिणाम से जुड़ा है।",
  coverageZeroNote:
    "जिन फ़ाइलों में 0 अंतरण हैं, उन्हें पूरी तरह पढ़ा और गुणवत्ता-जाँचा गया — उनकी पंक्तियों में कोई सुलझा हुआ खाते-से-खाता अंतरण नहीं है (नकद निकासी, अज्ञात प्रतिपक्षी, एकतरफ़ा प्रविष्टियाँ), इसलिए वे पंक्तियाँ जोड़ती हैं पर रुपया नहीं।",
  noMatchedTransfers: "कोई मिलान अंतरण नहीं",
  sourceFile: "स्रोत फ़ाइल",
  sourceFiles: "स्रोत फ़ाइलें",
  volumeByFile: "स्रोत फ़ाइल के अनुसार मात्रा",
  rowsUnit: "पंक्तियाँ",
  filesUnit: "फ़ाइलें",
  transfersUnit: "अंतरण",
  extraction: "निष्कर्षण",
  quality: "गुणवत्ता",
  description: "विवरण",
  rowsAnalysed: "विश्लेषित पंक्तियाँ",
  block: "ब्लॉक",
  auditChainTitle: "ऑडिट श्रृंखला",
  auditChainNote: "प्रत्येक प्रविष्टि पिछली प्रविष्टि के हैश से जुड़ती है",
  allLayers: "सभी परतें",
  showAllLayers: "सभी दिखाएँ",
  hideAllLayers: "सभी छिपाएँ",
  layerIncidents: "घटना मार्कर",
  layerRiskAreas: "एच3 जोखिम क्षेत्र",
  layerTowers: "सेल टावर",
  layerEntities: "इकाई स्थान",
  layerTrails: "गतिविधि पथ",
  layerCalls: "कॉल-संबंधित स्थान",
  movementTrail: "गतिविधि पथ",
  entityLocationsLabel: "इकाई स्थान",
  incidentMarkersLabel: "घटना मार्कर",
  riskAreasLabel: "एच3 जोखिम क्षेत्र",
  cellTowersLabel: "सेल टावर",
  callLocationsLabel: "कॉल-संबंधित स्थान",
  movementTrailsLabel: "गतिविधि पथ",
  timeSlider: "दिन का समय",
  allDay: "पूरा दिन",
  morning: "सुबह",
  afternoon: "दोपहर",
  evening: "शाम",
  night: "रात",
  noEventsInWindow: "इस समय विंडो में कोई घटना नहीं",
  expandNetworkHint: "नोड पर डबल-क्लिक करें या विस्तार नियंत्रण उपयोग करें",
  relationship: "संबंध",
  dateFrom: "से",
  dateTo: "तक",
  last7Days: "पिछले 7 दिन",
  last30Days: "पिछले 30 दिन",
  last90Days: "पिछले 90 दिन",
  anyDate: "कोई भी दिनांक",
  graphLegend: "ग्राफ़ संकेत",
  edgeCalled: "कॉल किया",
  edgePaid: "भुगतान किया",
  edgeVisited: "दौरा किया",
  edgeAssociated: "संबद्ध",
  edgeRegistered: "पंजीकृत",
  edgeLinked: "जुड़ा",
  nodeSelected: "नोड चयनित",
  entityDrawerTitle: "इकाई इंटेलिजेंस",
  viewTimelineAction: "समयरेखा देखें",
  expandNetworkAction: "नेटवर्क विस्तारित करें",
  openCasesAction: "मामले खोलें",
  traceMoneyAction: "धन का पता लगाएँ",
  viewOnMapAction: "मैप पर देखें",
  linkedCasesLabel: "संबंधित मामले",
  phoneNumbersLabel: "फ़ोन नंबर",
  bankAccountsLabel: "बैंक खाते",
  associatesLabel: "सहयोगी",
  locationsLabel: "स्थान",
  vehiclesLabel: "वाहन",
  confidenceScore: "विश्वास",
  candidateMatches: "संभावित मिलान",
  linkedEntityLabel: "जुड़ी इकाई",
  linkedCaseLabel: "जुड़ा मामला",
  demoDataLabel: "डेमो डेटा",
  faceGalleryNote:
    "सभी संभावित मिलान काल्पनिक प्रदर्शन डेटा हैं। कोई वास्तविक बायोमेट्रिक मिलान नहीं किया जाता।",
  matchConfirmed: "पुष्ट",
  matchProbable: "संभावित",
  matchUnverified: "असत्यापित",
  matchRejected: "अस्वीकृत",
  confirmMatch: "मिलान पुष्टि करें",
  rejectMatch: "मिलान अस्वीकार करें",
  matchedWith: "इससे मिलान",
  matchedFrom: "स्रोत फ़ाइलें",
  similarityLabel: "समरूपता",
  faceComparisonTitle: "चेहरा तुलना",
  referenceImage: "संदर्भ चित्र",
  captureImage: "कैप्चर चित्र",
  noComparison: "कोई समकक्ष चित्र दर्ज नहीं है।",
  decidedByLabel: "निर्णयकर्ता",
  decidedAtLabel: "निर्णय समय",
  faceAlertTitle: "मिलान समीक्षा बाकी",
  faceAlertBody:
    "एक पहचान उम्मीदवार सीसीटीवी फ्रेम को ज्ञात विषय से जोड़ता है। इसे पुष्टि या अस्वीकार करें।",
  decisionRecorded: "निर्णय दर्ज किया गया",
  decisionFailed: "निर्णय सहेजा नहीं जा सका",
  cameraLabel: "कैमरा",
  capturedLabel: "कैप्चर",
  caseSummary: "केस सारांश",
  keyEntities: "प्रमुख इकाइयाँ",
  riskIndicators: "जोखिम संकेतक",
  investigationTimeline: "जाँच समयरेखा",
  recentActivity: "हाल की गतिविधि",
  caseStatus: "स्थिति",
  caseRisk: "जोखिम",
  entitiesMetric: "इकाइयाँ",
  relationshipsMetric: "संबंध",
  tracedMetric: "पता लगाया",
  linkedCasesMetric: "संबंधित मामले",
  evidenceTab: "साक्ष्य",
  networkTab: "नेटवर्क",
  cdrTab: "सीडीआर",
  moneyTrailTab: "धन मार्ग",
  timelineTab: "समयरेखा",
  reportsTab: "रिपोर्ट",
  exportCaseSummary: "केस सारांश",
  exportEntities: "इकाइयाँ",
  exportEvidence: "साक्ष्य",
  exportTimeline: "समयरेखा",
  exportCenterDescription:
    "इस केस के रिकॉर्ड CSV के रूप में डाउनलोड करें। प्रत्येक निर्यात में केवल इस पेज पर दिखने वाला डेटा शामिल है।",
  caseNotFound: "केस नहीं मिला",
  backToCases: "मामलों पर वापस",
  searchCases: "मामले खोजें...",
  caseList: "मामला सूची",
  openCase: "मामला खोलें",
  priority: "प्राथमिकता",
  station: "थाना",
  category: "श्रेणी",
  progressLabel: "प्रगति",
  evidenceCountLabel: "साक्ष्य",
  leadOfficerLabel: "प्रमुख अधिकारी",
  openedLabel: "खोला गया",
  updatedLabel: "अद्यतन",
  allCases: "सभी मामले",
  activeOnly: "केवल सक्रिय",
  noCasesMatch: "वर्तमान फ़िल्टर से कोई मामला मेल नहीं खाता",
  noCasesMatchBody: "परिणाम देखने के लिए फ़िल्टर बदलें या हटाएँ।",
  entitySearchPlaceholder: "इकाइयाँ खोजें...",
  entityKindFilter: "इकाई प्रकार",
  entityRiskFilter: "जोखिम स्तर",
  entityCount: "इकाइयाँ",
  noEntitiesMatch: "वर्तमान फ़िल्टर से कोई इकाई मेल नहीं खाती",
  noEntitiesMatchBody: "परिणाम देखने के लिए फ़िल्टर बदलें या हटाएँ।",
  viewProfile: "प्रोफ़ाइल देखें",
  notificationsTitle: "सूचनाएँ",
  markAllRead: "सभी पढ़ी हुई चिह्नित करें",
  noNotifications: "कोई सूचना नहीं",
  unread: "अपठित",
  read: "पढ़ी हुई",
  closeNotifications: "सूचनाएँ बंद करें",
  profileMenu: "प्रोफ़ाइल मेनू",
  languageToggle: "भाषा",
  english: "अंग्रेज़ी",
  hindi: "हिन्दी",
  commandPalettePlaceholder: "किसी अनुभाग पर जाएँ या रिकॉर्ड खोजें...",
  noCommands: "कोई मेल खाता कमांड नहीं",
  navigate: "नेविगेट",
  searchRecords: "रिकॉर्ड खोजें",
  sections: "अनुभाग",
  records: "रिकॉर्ड",
  pressEnter: "एंटर",
  pressEsc: "एस्क",
  sidebarSections: "अनुभाग",
  collapse: "छोटा करें",
  expandSidebarLabel: "साइडबार बड़ा करें",
  systemStatusOperational: "सभी इंटेलिजेंस सेवाएँ सक्रिय",
  roleInspector: "निरीक्षक",
  roleSupervisor: "पर्यवेक्षक",
  roleAdmin: "प्रशासक",
  roleAuditLogger: "ऑडिट लॉगर",
  roleInspectorDesc: "सौंपे गए मामले और व्यक्तिगत कार्यभार",
  roleSupervisorDesc: "टीम कार्यभार और अनुमोदन",
  roleAdminDesc: "सिस्टम मेट्रिक्स और पहुँच प्रबंधन",
  roleAuditLoggerDesc: "ऑडिट ट्रेल और श्रृंखला अखंडता",
  searchNoResults: "कोई मेल खाता रिकॉर्ड नहीं",
  searchStartTyping: "कम से कम 2 अक्षर लिखें",
  searchGroupCases: "मामले",
  searchGroupPersons: "व्यक्ति",
  searchGroupPhones: "फ़ोन",
  searchGroupAccounts: "खाते",
  searchGroupVehicles: "वाहन",
  searchGroupOrganizations: "संगठन",
  searchGroupLocations: "स्थान",
  openResult: "खोलें",
  resultCount: "परिणाम",
  showingResults: "दिखा रहे हैं",
  clearSearch: "खोज हटाएँ",
  closeSearch: "खोज बंद करें",
  searchShortcut: "खोज",
  notificationsEmpty: "कोई सूचना नहीं",
  notificationsEmptyBody: "आप पूरी तरह अपडेट हैं।",
  viewNotification: "देखें",
  dismissNotification: "खारिज करें",
  profileRole: "भूमिका",
  profileStation: "थाना",
  profileBadge: "बैज",
  languageEnglish: "अंग्रेज़ी",
  languageHindi: "हिन्दी",
  switchToHindi: "हिन्दी",
  switchToEnglish: "English",
  currentLanguage: "वर्तमान भाषा",
  demoNotice: "डेमो डेटा",
  demoNoticeBody: "इस एप्लिकेशन में सभी पहचान और रिकॉर्ड काल्पनिक प्रदर्शन डेटा हैं।",
  dismiss: "खारिज करें",
  loadingRecords: "रिकॉर्ड लोड हो रहे हैं",
  loadingGraph: "ग्राफ़ लोड हो रहा है",
  loadingMap: "मैप लोड हो रहा है",
  loadingFlow: "प्रवाह लोड हो रहा है",
  loadingCase: "केस लोड हो रहा है",
  loadingEntity: "इकाई लोड हो रही है",
  loadingEvidence: "साक्ष्य लोड हो रहे हैं",
  loadingAudit: "ऑडिट लॉग लोड हो रहा है",
  loadingCdr: "कॉल रिकॉर्ड लोड हो रहे हैं",
  loadingMoney: "धन मार्ग लोड हो रहा है",
  loadingNetwork: "नेटवर्क लोड हो रहा है",
  loadingFace: "मिलान लोड हो रहे हैं",
  loadingAi: "सहायक लोड हो रहा है",
  loadingSecurity: "सुरक्षा डेटा लोड हो रहा है",
  loadingCommandCenter: "कमांड सेंटर लोड हो रहा है",
  loadingCases: "मामले लोड हो रहे हैं",
  loadingEntities: "इकाइयाँ लोड हो रही हैं",
  loadingReports: "रिपोर्ट लोड हो रही हैं",
  loadingTimeline: "समयरेखा लोड हो रही है",
  loadingConnections: "संबंध लोड हो रहे हैं",
  loadingCommunications: "संचार लोड हो रहा है",
  loadingFinancial: "वित्तीय गतिविधि लोड हो रही है",
  loadingLocations: "स्थान लोड हो रहे हैं",
  loadingOverview: "अवलोकन लोड हो रहा है",
  loadingInsights: "अंतर्दृष्टि लोड हो रही है",
  loadingFeed: "फ़ीड लोड हो रही है",
  loadingMetrics: "मेट्रिक्स लोड हो रहे हैं",
  loadingMarkers: "मार्कर लोड हो रहे हैं",
  loadingNodes: "नोड लोड हो रहे हैं",
  loadingStages: "चरण लोड हो रहे हैं",
  loadingTransactions: "लेनदेन लोड हो रहे हैं",
  loadingEvents: "घटनाएँ लोड हो रही हैं",
  loadingItems: "आइटम लोड हो रहे हैं",
  loadingMatches: "मिलान लोड हो रहे हैं",
  loadingPrompts: "प्रश्न लोड हो रहे हैं",
  loadingSuggestions: "सुझाव लोड हो रहे हैं",
  loadingResults: "परिणाम लोड हो रहे हैं",
  loadingSections: "अनुभाग लोड हो रहे हैं",
  loadingRecordsLabel: "रिकॉर्ड",
  loadingGraphLabel: "ग्राफ़",
  loadingMapLabel: "मैप",
  loadingFlowLabel: "प्रवाह",
  loadingCaseLabel: "केस",
  loadingEntityLabel: "इकाई",
  loadingEvidenceLabel: "साक्ष्य",
  loadingAuditLabel: "ऑडिट",
  loadingCdrLabel: "सीडीआर",
  loadingMoneyLabel: "धन",
  loadingNetworkLabel: "नेटवर्क",
  loadingFaceLabel: "फेस",
  loadingAiLabel: "एआई",
  loadingSecurityLabel: "सुरक्षा",
  loadingCommandCenterLabel: "कमांड सेंटर",
  loadingCasesLabel: "मामले",
  loadingEntitiesLabel: "इकाइयाँ",
  loadingReportsLabel: "रिपोर्ट",
  loadingTimelineLabel: "समयरेखा",
  loadingConnectionsLabel: "संबंध",
  loadingCommunicationsLabel: "संचार",
  loadingFinancialLabel: "वित्तीय",
  loadingLocationsLabel: "स्थान",
  loadingOverviewLabel: "अवलोकन",
  loadingInsightsLabel: "अंतर्दृष्टि",
  loadingFeedLabel: "फ़ीड",
  loadingMetricsLabel: "मेट्रिक्स",
  loadingMarkersLabel: "मार्कर",
  loadingNodesLabel: "नोड",
  loadingStagesLabel: "चरण",
  loadingTransactionsLabel: "लेनदेन",
  loadingEventsLabel: "घटनाएँ",
  loadingItemsLabel: "आइटम",
  loadingMatchesLabel: "मिलान",
  loadingPromptsLabel: "प्रश्न",
  loadingSuggestionsLabel: "सुझाव",
  loadingResultsLabel: "परिणाम",
  loadingSectionsLabel: "अनुभाग",
  entityId: "इकाई आईडी",
  name: "नाम",
  caseIdHeader: "केस आईडी",
  titleHeader: "शीर्षक",
  matchIdHeader: "मिलान आईडी",
  subjectHeader: "विषय",
  ipHeader: "आईपी",
  casesTitle: "मामले",
  cdrTitle: "सीडीआर विश्लेषण",
  faceTitle: "फेस इंटेलिजेंस",
  securityTitle: "सुरक्षा और ऑडिट",
  biometricReview: "बायोमेट्रिक समीक्षा",
  chainTitle: "श्रृंखला",
  auditChainHeading: "ऑडिट श्रृंखला",
  casesDescription:
    "स्थिति, प्राथमिकता, जोखिम मूल्यांकन और नियुक्त प्रमुख अधिकारी के साथ सभी पंजीकृत मामले।",
  cdrDescriptionText:
    "नाइटफ़ॉल नेटवर्क के कॉल विवरण रिकॉर्ड, रात्रि-विंडो और चिह्नित कॉल पहचान के साथ।",
  faceDescriptionText:
    "कैमरा मिलान समीक्षा कतार। विश्वास और समानता स्कोर पाइपलाइन के फेस एम्बेडिंग से आते हैं; अनुरक्षक निर्णय दर्ज करने के लिए उम्मीदवार की पुष्टि या अस्वीकृति करें।",
  securityDescriptionText:
    "प्रत्येक पहुँच और क्रिया का केवल-जोड़ ऑडिट लॉग, गंभीरता वर्गीकरण और अनुक्रम सत्यापन के साथ।",
  riskCritical: "गंभीर",
  riskHigh: "उच्च",
  riskMedium: "मध्यम",
  riskLow: "निम्न",
  typeVoice: "वॉइस",
  typeSms: "एसएमएस",
  typeData: "डेटा",
  flaggedOnly: "केवल चिह्नित",
  yes: "हाँ",
  no: "नहीं",
  reviewQueue: "समीक्षा कतार",
  totalMatches: "कुल मिलान",
  needsReview: "समीक्षा आवश्यक",
  selectMatch: "निरीक्षण के लिए मिलान चुनें।",
  chainVerifiedLabel: "श्रृंखला सत्यापित",
  auditTimelineNote: "सबसे हाल की पहुँच और क्रिया घटनाएँ",
  auditInspectorAccessedCase: "निरीक्षक ने केस देखा",
  auditCrossStationSearch: "क्रॉस-स्टेशन खोज का अनुरोध",
  auditEvidenceIntegrityVerified: "साक्ष्य अखंडता सत्यापित",
  auditExportAttemptBlocked: "निर्यात प्रयास अवरुद्ध",
  recordsLabel: "रिकॉर्ड",
  matchesLabel: "मिलान",
  eventsLabel: "घटनाएँ",
  openLabel: "खोलें",
  exportRegister: "रजिस्टर निर्यात करें",
  keyEvents: "प्रमुख घटनाएँ",
  displayName: "प्रदर्शन नाम",
  emailOrBadge: "ईमेल या बैज आईडी",
  password: "पासवर्ड",
  signInTitle: "CrimeNet में साइन इन करें",
  signInSubtitle:
    "अपने CrimeNet खाते से साइन इन करें। भूमिका और स्टेशन साइन किए गए एक्सेस टोकन से पढ़ी जाती है — कोई भूमिका चयनकर्ता नहीं है।",
  jurisdiction: "क्षेत्राधिकार",
  signInCta: "साइन इन",
  sessionNotice: "आपका एक्सेस स्तर और स्टेशन प्रमाणीकरण के बाद जारी टोकन से आता है।",
  forbiddenTitle: "403 — पहुँच प्रतिबंधित",
  forbiddenBody:
    "आपके खाते की भूमिका को इस अनुभाग को खोलने की अनुमति नहीं है। आवश्यकता हो तो व्यवस्थापक से संपर्क करें।",
  forbiddenCaseBody:
    "इस मामले पर आपका एक्सेस स्तर इसे खोलने के लिए पर्याप्त नहीं है। मामले तक पहुँच के लिए पर्यवेक्षक या व्यवस्थापक से कहें।",
  backToDashboard: "कमांड सेंटर पर वापस",
  readOnlyAccess: "केवल पठन-योग्य पहुँच",
  writeRestricted: "आपके एक्सेस स्तर से साक्ष्य अपलोड या पाइपलाइन रन की अनुमति नहीं है।",
  createCaseRestricted: "केस पंजीकरण केवल पर्यवेक्षकों और व्यवस्थापकों के लिए है।",
  newCase: "नया केस",
  stationLockedNote: "पर्यवेक्षक केवल अपने ही स्टेशन में केस दर्ज कर सकते हैं।",
  caseIntake: "केस इनटेक",
  caseIntakeHint: "एफ़आईआर दर्ज करें, उसका साक्ष्य जोड़ें, फिर पाइपलाइन चलाएँ।",
  firNumber: "एफ़आईआर नंबर",
  firs: "एफ़आईआर",
  firNumberHint: "रिपोर्ट पर लिखे अनुसार; सिस्टम अपना क्रमिक आईडी जारी करता है।",
  caseTitle: "केस शीर्षक",
  caseDescription: "विवरण",
  registerCase: "केस दर्ज करें",
  caseRegistered: "केस दर्ज हुआ",
  addEvidence: "साक्ष्य फ़ाइलें",
  chooseFiles: "फ़ाइलें चुनें",
  noFilesSelected: "कोई फ़ाइल नहीं चुनी",
  startRun: "पाइपलाइन चलाएँ",
  appendRun: "जोड़ें और पुनः चलाएँ",
  runInProgress: "चल रही है",
  runCompleted: "पूर्ण",
  runFailed: "विफल",
  filesQueued: "फ़ाइलें कतार में",
  graphAnalytics: "ग्राफ़ एनालिटिक्स",
  analyticsHint:
    "नेटवर्क में कौन पुल है, कौन से समूह बने और जोखिम कहाँ केंद्रित है — पाइपलाइन रन से सीधे।",
  centrality: "केंद्रीयता",
  centralityHelp:
    "डिग्री सीधे लिंक गिनती है। बीचेनेस वह हिस्सा है जो इस नोड से गुज़रता है — ऊँचा मान पुल है। निकटता बताती है कि यह बाकी नोड्स कितने पास है। आइजेनवेक्टर अच्छी तरह जुड़े पड़ोसियों का श्रेय देता है।",
  communities: "समुदाय",
  componentsLabel: "घटक",
  multiHop: "मल्टी-हॉप पथ",
  pathsHelp:
    "बीच के नोड्स से होकर अनुमानित रास्ते। विश्वास रास्ते के एज-विश्वासों का गुणनफल है — कम मान को तथ्य नहीं, जाँच योग्य सुराग मानें।",
  riskZones: "जोखिम क्षेत्र",
  riskBand: "जोखिम बैंड",
  betweenness: "बीचेनेस",
  closeness: "निकटता",
  degree: "डिग्री",
  eigenvector: "आइजेनवेक्टर",
  nodeCount: "नोड्स",
  edgeCount: "एज",
  rankedByBetweenness: "बीचेनेस से क्रमबद्ध",
  rankedByConfidence: "विश्वास से क्रमबद्ध",
  rankedByRisk: "जोखिम स्कोर से क्रमबद्ध",
  hops: "हॉप",
  inferred: "अनुमानित",
  mostly: "मुख्यतः",
  density: "घनत्व",
  internalLinks: "आंतरिक लिंक",
  nodesUnit: "नोड",
  mainCluster: "मुख्य समूह",
  smallClusters: "छोटे समूह",
  isolated: "अलग-थलग",
  investigation: "जाँच",
  candidate: "उम्मीदवार",
  suspectsLabel: "संदिग्ध",
};

const dictionaries: Record<Language, UiStrings> = { en, hi };

export function getStrings(language: Language): UiStrings {
  return dictionaries[language];
}
