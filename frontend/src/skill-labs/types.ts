// --- Shared types ---

export type SkillLabType =
  | 'cli' | 'policy-fix'
  | 'architecture-builder' | 'log-analysis' | 'network-path'
  | 'ordering' | 'config-toggle' | 'cost-optimization'
  | 'security-hardening' | 'performance-optimization'
  | 'service-limits'
  | 'code-fix' | 'fill-command' | 'drag-match' | 'diagram-label'
  | 'incident-response' | 'drift-detection'
  | 'phased-pipeline' | 'terminal-replay' | 'command-terminal'

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced'

export interface LabAnswer {
  id: string
  text: string
  correct?: boolean
}

export interface LabSummary {
  id: string
  title: string
  description: string
  type: SkillLabType
  difficulty: SkillLevel
  platform: string
  category: string
  technologies: string[]
  labCategory: string      // e.g. "Troubleshoot", "Design", "Implement"
  s3VersionId?: string
  locked?: boolean
  showcase?: boolean
  showcaseOrder?: number
  learningOutcomes?: string[]     // "What you'll demonstrate" bullets
  realWorldValue?: string         // Short paragraph — why this matters on the job
  relatedExamCodes?: string[]     // e.g. ['SAA-C03', 'CLF-C02']
  mermaidCode?: string            // Optional scenario diagram (mermaid source)
}

export const LAB_TIME_LIMITS: Record<SkillLevel, number> = {
  beginner: 5 * 60,
  intermediate: 10 * 60,
  advanced: 15 * 60,
}

// --- Shared graph types (network-path) ---

export interface LabNode {
  id: string
  label: string
  x?: number
  y?: number
}

export interface LabEdge {
  source: string
  target: string
  label?: string
}

// --- CLI lab types ---

export interface CliCommand {
  command: string
  output: string
}

export interface CliLabDefinition extends LabSummary {
  type: 'cli'
  scenario: string
  commands: CliCommand[]
  expectedCommands: string[]
  answers: LabAnswer[]
  explanation: string
}

// --- Policy Fix lab types ---

export interface PolicyValidation {
  field: string
  expected: string
}

export interface PolicyFixLabDefinition extends LabSummary {
  type: 'policy-fix'
  scenario: string
  brokenPolicy: string
  correctPolicy: string
  validations: PolicyValidation[]
  explanation: string
}

// --- Architecture Builder lab types ---

export interface ArchitectureComponent {
  id: string
  label: string
  icon: string
  category: string
}

export interface ArchitectureBuilderLabDefinition extends LabSummary {
  type: 'architecture-builder'
  scenario: string
  availableComponents: ArchitectureComponent[]
  requiredComponents: string[]
  requiredConnections: { from: string; to: string }[]
  validationChecks: string[]
  explanation: string
}

// --- Log Analysis lab types ---

export interface LogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  source: string
  message: string
}

export interface LogAnalysisLabDefinition extends LabSummary {
  type: 'log-analysis'
  scenario: string
  logs: LogEntry[]
  answers: LabAnswer[]
  explanation: string
}

// --- Network Path Debugging lab types ---

export interface NetworkStep {
  id: string
  label: string
  checkLabel: string
  status: 'pass' | 'fail'
  detail: string
}

export interface NetworkPathLabDefinition extends LabSummary {
  type: 'network-path'
  scenario: string
  nodes: LabNode[]
  edges: LabEdge[]
  steps: NetworkStep[]
  answers: LabAnswer[]
  explanation: string
}

// --- Ordering lab types ---

export interface OrderingStep {
  id: string
  text: string
  correctPosition: number
}

export interface OrderingLabDefinition extends LabSummary {
  type: 'ordering'
  scenario: string
  steps: OrderingStep[]
  explanation: string
}

// --- Config Toggle lab types ---

export interface ConfigItem {
  id: string
  label: string
  shortLabel?: string
  currentValue: string
  correctValue: string
  inputType: 'text' | 'select'
  options?: string[]
}

export interface ConfigVisualGroup {
  id: string
  label: string
  sublabel?: string
  zone: string
  itemIds: string[]
}

export interface ConfigVisualZone {
  id: string
  label: string
  color?: 'blue' | 'orange' | 'green' | 'neutral'
  row?: number
}

export interface ConfigToggleLabDefinition extends LabSummary {
  type: 'config-toggle'
  scenario: string
  configItems: ConfigItem[]
  explanation: string
  visualGroups?: ConfigVisualGroup[]
  visualZones?: ConfigVisualZone[]
  visualContainerLabel?: string
}

// --- Cost Optimization lab types ---

export interface CostComponent {
  id: string
  name: string
  currentService: string
  currentCost: number
  alternatives: { service: string; cost: number }[]
  correctService: string
}

export interface CostOptimizationLabDefinition extends LabSummary {
  type: 'cost-optimization'
  scenario: string
  targetCost: number
  components: CostComponent[]
  explanation: string
}

// --- Security Hardening lab types ---

export interface SecurityIssue {
  id: string
  resource: string
  issue: string
  options: string[]
  correctOption: string
}

export interface SecurityHardeningLabDefinition extends LabSummary {
  type: 'security-hardening'
  scenario: string
  issues: SecurityIssue[]
  explanation: string
}

// --- Performance Optimization lab types ---

export interface PerformanceProblem {
  id: string
  area: string
  problem: string
  options: string[]
  correctOption: string
}

export interface PerformanceOptLabDefinition extends LabSummary {
  type: 'performance-optimization'
  scenario: string
  architectureDescription: string
  problems: PerformanceProblem[]
  explanation: string
}

// --- Service Limits / Scaling lab types ---

export interface ScalingMetric {
  id: string
  metric: string
  currentValue: string
  targetValue: string
  options: string[]
  correctOption: string
}

export interface ServiceLimitsLabDefinition extends LabSummary {
  type: 'service-limits'
  scenario: string
  metrics: ScalingMetric[]
  explanation: string
}

// --- Code Fix lab types ---

export interface CodeFixLabDefinition extends LabSummary {
  type: 'code-fix'
  scenario: string
  language: string        // Monaco language id: 'yaml' | 'bash' | 'dockerfile' | 'json' | etc.
  brokenCode: string
  correctCode: string
  validations: Array<{ field: string; expected: string }>
  explanation: string
}

// --- Fill Command lab types ---

export interface FillCommandQuestion {
  id: string
  template: string        // e.g. "kubectl ___ --namespace prod"
  blanks: Array<{ id: string; placeholder: string; answer: string }>
  hint?: string
}

export interface FillCommandLabDefinition extends LabSummary {
  type: 'fill-command'
  scenario: string
  questions: FillCommandQuestion[]
  explanation: string
}

// --- Drag Match lab types ---

export interface DragMatchPair {
  id: string
  term: string
  definition: string
}

export interface DragMatchLabDefinition extends LabSummary {
  type: 'drag-match'
  scenario: string
  pairs: DragMatchPair[]
  explanation: string
}

// --- Diagram Label lab types ---

export interface DiagramHotspot {
  id: string
  x: number               // % from left
  y: number               // % from top
  options: string[]
  answer: string
  label: string           // shown after submit
}

export interface DiagramLabelLabDefinition extends LabSummary {
  type: 'diagram-label'
  scenario: string
  imageUrl: string
  hotspots: DiagramHotspot[]
  explanation: string
}

// --- Incident Response lab types ---

export interface IncidentAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  time: string
  service: string
  message: string
}

export interface IncidentMetric {
  id: string
  name: string
  unit: string
  values: { time: string; value: number }[]
}

export interface IncidentTimelineEvent {
  time: string
  event: string
}

export interface IncidentAction {
  id: string
  description: string
  correct: boolean
}

export interface IncidentResponseLabDefinition extends LabSummary {
  type: 'incident-response'
  scenario: string
  alerts: IncidentAlert[]
  metrics: IncidentMetric[]
  logs: LogEntry[]
  timeline: IncidentTimelineEvent[]
  actions: IncidentAction[]
  answers: LabAnswer[]
  explanation: string
}

// --- Drift Detection lab types ---

export interface DriftResource {
  id: string
  resourceType: string
  resourceName: string
  expected: Record<string, string>
  actual: Record<string, string>
  drifted: boolean
}

export interface DriftDetectionLabDefinition extends LabSummary {
  type: 'drift-detection'
  scenario: string
  resources: DriftResource[]
  explanation: string
}

// --- Phased Pipeline lab types ---

export interface PipelinePhase {
  id: string
  label: string
  color?: 'blue' | 'orange' | 'green' | 'purple'
}

export interface PipelineStep {
  id: string
  text: string
  command?: string
  correctPhaseId: string
  // IDs of steps in the same phase that must appear before this one.
  // Steps without mustFollowIds can appear at any position within their phase.
  mustFollowIds?: string[]
}

export interface PhasedPipelineLabDefinition extends LabSummary {
  type: 'phased-pipeline'
  scenario: string
  phases: PipelinePhase[]
  steps: PipelineStep[]
  explanation: string
}

// --- Terminal Replay lab types ---

export interface TerminalReplayCommand {
  id: string
  command: string
  label?: string  // Optional markdown-formatted chip label; falls back to command if omitted
  successOutput: string
  errorOutput: string
  isDistractor?: boolean
  mustFollowIds?: string[]  // IDs that must have run before this command
}

export interface TerminalReplayLabDefinition extends LabSummary {
  type: 'terminal-replay'
  scenario: string
  prompt: string
  commands: TerminalReplayCommand[]
  explanation: string
}

// --- Command Terminal lab types ---

export interface CommandTerminalRequirement {
  id: string
  kind: 'flag' | 'flag-value' | 'positional'
  variants: string[]           // Accepted tokens, e.g. ['-y', '--assumeyes'] or ['nginx']
  value?: string               // Required value when kind === 'flag-value'
  description: string          // Shown in --help output
}

export interface CommandTerminalDistractor {
  flag: string
  description: string          // Accurate description, shown in --help
}

export interface CommandTerminalStep {
  id: string
  task: string                 // Markdown task description
  hint?: string                // Optional markdown hint
  program: string              // Expected first token, e.g. 'dnf'
  requirements: CommandTerminalRequirement[]
  distractors: CommandTerminalDistractor[]
  successOutput: string
  canonicalCommand: string     // For explanation reference
}

export interface CommandTerminalLabDefinition extends LabSummary {
  type: 'command-terminal'
  scenario: string
  prompt: string               // e.g. '[root@rhel10 ~]#'
  steps: CommandTerminalStep[]
  explanation: string
}

// Union of all lab definitions
export type LabDefinition =
  | CliLabDefinition | PolicyFixLabDefinition
  | ArchitectureBuilderLabDefinition | LogAnalysisLabDefinition | NetworkPathLabDefinition
  | OrderingLabDefinition | ConfigToggleLabDefinition | CostOptimizationLabDefinition
  | SecurityHardeningLabDefinition | PerformanceOptLabDefinition
  | ServiceLimitsLabDefinition
  | CodeFixLabDefinition | FillCommandLabDefinition | DragMatchLabDefinition
  | DiagramLabelLabDefinition | IncidentResponseLabDefinition | DriftDetectionLabDefinition
  | PhasedPipelineLabDefinition | TerminalReplayLabDefinition | CommandTerminalLabDefinition
