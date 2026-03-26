🔧 New Lab Types to Add (High Impact)
1. Incident Response Lab

Why: Huge for AWS/Azure/K8s + Security+ / CySA+

Concept

Something is broken in prod
User must investigate + fix under time pressure

Runner idea

Pre-seeded environment with multiple signals:
metrics
logs
alerts
Timer + scoring based on steps

Example labs

“API latency spike in Kubernetes cluster”
“IAM key leaked – rotate and lock down”
“Azure VM unreachable (NSG misconfig + DNS issue combo)”
2. Cost Optimization Lab (Advanced)

You already have cost-optimization, but go deeper.

Add dimension:

Tradeoffs (performance vs cost)
Multi-service impact

Runner upgrades

Show billing dashboard snapshot
Let users simulate changes

Example

Reduce AWS bill by 40% without breaking SLA
Identify zombie resources (EBS, IPs, snapshots)
3. Security Attack Simulation Lab

Why: Game-changer for engagement + real skills

Concept

User plays defender (or attacker-lite)

Runner

Pre-scripted attack chain
User must detect + stop

Examples

Privilege escalation via IAM role chaining
Container breakout in Kubernetes
Misconfigured S3 bucket exploited
4. Migration Lab

Why: Big exam topic (AWS SA, Azure Admin)

Concept

Move system from A → B

Runner

Multi-step workflow validation

Examples

On-prem → AWS (lift & shift)
Monolith → microservices (K8s)
Azure VM → App Service
5. Performance Tuning Lab

Why: Often underrepresented but critical

Runner

Metrics dashboard + bottleneck hints

Examples

Fix slow database queries
Optimize Kubernetes pod autoscaling
Improve API throughput under load
6. Failure Injection / Chaos Lab

Why: Advanced but extremely valuable

Concept

Things break randomly

Runner

Inject failures (node down, latency, packet loss)

Examples

Kubernetes node failure → restore service
AZ outage simulation → reroute traffic
7. Design Review / Critique Lab

Why: Exams test judgment, not just building

Concept

Given an architecture, identify flaws

Runner

Multiple-choice + explanation scoring

Examples

“What’s wrong with this multi-region setup?”
“Which design violates least privilege?”
8. Drift Detection Lab

Why: Real-world DevOps problem

Concept

Infra drift vs IaC

Runner

Show expected vs actual state

Examples

Terraform drift in AWS
Kubernetes config drift from GitOps
9. Runbook Execution Lab

Why: Very enterprise-realistic

Concept

Follow incomplete/incorrect runbook

Runner

Step validation + correction

Examples

Incident recovery runbook with missing steps
Backup restore procedure
10. Multi-Service Integration Lab

Why: Exams LOVE service combinations

Examples

AWS: S3 + Lambda + SNS pipeline
Azure: Event Grid + Functions + Cosmos DB
Kubernetes: Ingress + Service Mesh + Secrets