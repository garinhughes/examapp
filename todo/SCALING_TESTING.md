# Scaling and Stress-testing Plan — ExamApp

## Summary of current AWS infra (observed)
- Frontend: CloudFront + S3 (static) served by module `cloudfront`.
- Backend: single ECS service behind an ALB. There are two task-def representations in-repo:
  - `backend/infra/ecs-task-def.json` (authoritative deployed task def per repo README): cpu=512 (0.5 vCPU), memory=1024 MiB, containerPort=3000, desired_count (deployed) = 1.
  - Terraform `module "ecs"` (infra/terraform) defaults used in plan: cpu=256 (0.25 vCPU), memory=512 MiB, desired_count=1 (module instantiation sets cpu=256/memory=512).
- ALB target group health-check: `GET /health`, interval 30s, timeout 5s, healthy_threshold=2.
- DynamoDB tables: created with `billing_mode = PAY_PER_REQUEST` (on-demand) — reads/writes scale automatically.
- No ECS autoscaling (Application Auto Scaling) resources found in repo (no `aws_appautoscaling_*` or equivalent Terraform resources present).

## Quick capacity estimate (conservative)
Assumptions:
- Node.js Fastify backend is mostly I/O bound (DynamoDB, S3 calls) but some endpoints perform compute (JWT, signing, template rendering).
- Average request profile during normal exam activity: ~50–300 ms server CPU time depending on endpoint; heavy operations (certificates, report creation) cost more.

Estimates:
- If deployed task uses 0.5 vCPU (512) + 1 GiB RAM: expect roughly 20–50 steady concurrent active requests per task before CPU becomes saturated. Peak short bursts may be higher but will increase p95 latency and errors.
- If deployed task uses 0.25 vCPU (256) + 512 MiB RAM: expect roughly 8–20 concurrent active requests per task.

Therefore with desired_count = 1 the service is likely to sustain ~10–50 concurrent active users depending on the task size and real request mix. For production safety, plan for autoscaling.

## Stress-testing plan (what to run and what to measure)
1. Tools: use `k6` (recommended) or `wrk`/`vegeta`. `k6` is easy for scripting user journeys and capturing RPS/latency.
2. Create scenarios that reflect real user flows:
   - Browse exams (GET /exams)
   - Open exam (GET /exams/:id/questions)
   - Submit answer / save attempt (POST /attempts)
   - Login token exchange if applicable (auth flow)
3. Run baseline small test to measure single-task capacity:
   - Ramp VUs from 1 → 50 over 3 minutes, hold 5 minutes, track p50/p95/p99 latencies, 5xx rate, and task CPU/memory.
4. Run burst and soak tests:
   - Burst: instant jump to X RPS for 1 minute to see throttling/failures.
   - Soak: sustained load for 60 minutes to find memory leaks, throttling, DynamoDB hot keys.
5. Metrics to collect:
   - ALB: RequestCount, HTTPCode_Target_5XX_Count, TargetResponseTime p50/p95.
   - ECS Task: CPUUtilization, MemoryUtilization, Running task count.
   - CloudWatch logs for 5xx traces and container OOM/killed events.
   - DynamoDB: ConsumedRead/WriteCapacity, ThrottledRequests, Latency.
   - S3 request/latency if exam payloads read from S3 frequently.

Example `k6` minimal scenario (outline):
```
import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  stages: [ { duration: '3m', target: 50 }, { duration: '5m', target: 50 }, { duration: '3m', target: 0 } ],
};

export default function () {
  http.get('https://api.certshack.com/exams');
  sleep(1);
  // sample read exam and submit example
  const exam = http.get('https://api.certshack.com/exams/SCS-C03/questions');
  sleep(1);
}
```

Run locally or from an EC2/ECS load generator (avoid running heavy k6 from your laptop for large tests). Collect CloudWatch metrics and ALB access logs.

## Autoscaling recommendations
1. Use Application Auto Scaling for the ECS service. Two recommended strategies (choose one or combine):
   - Target Tracking on ALBRequestCountPerTarget: keeps requests-per-target steady. Start with `target = 1200 requests/minute/target` (~20 RPS/target). This aligns with conservative per-task estimate for 0.5 vCPU.
   - Target Tracking on ECS CPUUtilization: keep CPU at target ~50% (scale out above ~60% sustained, scale in below ~30%).
2. Health / cooldown and evaluation windows:
   - Evaluation period: 60–120 seconds (or CloudWatch metric period 1m, evaluation 2 datapoints).
   - Scale-out threshold: sustained CPU > 60% for 2 consecutive 1-minute periods OR ALBRequestCountPerTarget > target for 2 minutes.
   - Scale-in threshold: CPU < 30% and ALB request count below target for 5 minutes.
3. Min/max capacity:
   - Minimum desired_count = 2 for production (one healthy, one spare) — consider availability zones and blue/green.
   - Maximum depends on budget; start with max = 10 (adjust after test results).
4. Use step-scaling for large spikes if you expect sudden bursts (scale out by 1-2 tasks per breach; large breaches by more).

## Example Terraform resources (snippet outline)
Use `aws_appautoscaling_target` and `aws_appautoscaling_policy` with `scalable_dimension = "ecs:service:DesiredCount"`. Example (outline — adapt names/ARNS):

```
resource "aws_appautoscaling_target" "ecs_backend" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "alb_rps_policy" {
  name               = "alb-rps-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label = "<alb/targetgroup/resource-label>" # set to ALB target group label
    }
    target_value       = 1200
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}
```

Notes: the `resource_label` for ALB predefined metric requires the ALB ARN suffix + target group — Terraform can compute this from outputs in `module.ecs` (see `alb_arn_suffix`/`target_group_arn_suffix` outputs).

## Operational checklist / next steps
- Run the baseline `k6` scenario and gather metrics while the service is at `desired_count = 1` and `= 2`.
- Tune `target_value` for `ALBRequestCountPerTarget` from observed RPS per healthy target (use: totalRequestCount / healthyTargetCount).
- If DynamoDB throttling observed, consider caching or distributing load (DAX or batched writes), but billing_mode PAY_PER_REQUEST will scale automatically.
- Add CloudWatch dashboards / alarms: ALB 5xxs, high TargetResponseTime p95, ECS CPU/Memory high, DynamoDB ThrottledRequests.

## Quick commands
- Run k6 (example):
```
# install k6, then:
k6 run --vus 50 --duration 10m tests/k6/exam-scenario.js
```
- Viewing ALB metrics (CloudWatch) and ECS task metrics in console or via `aws cloudwatch get-metric-statistics`.

---
File created by internal repo analysis on 2026-03-30. Adjust targets after first full load test.
