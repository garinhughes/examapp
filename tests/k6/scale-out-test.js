/**
 * Scale-out smoke test
 *
 * Goal: push ECS CPUUtilization above 70% sustained for ~2 minutes so
 * the scale-out alarm fires and a second task launches.
 *
 * Stages:
 *   0-2m  ramp from 1 → 80 VUs   (warm up, approach the threshold)
 *   2-8m  hold at 80 VUs          (sustain above 70% CPU for the 2×1min alarm)
 *   8-10m ramp down to 0          (let it idle — keep running or Ctrl-C here)
 *
 * Run test:
cd examapp
k6 run tests/k6/scale-out-test.js
 * Watch task count in a second terminal:
watch -n6 "aws ecs describe-services \
  --cluster examapp-cluster \
  --services examapp-backend-svc \
  --region eu-west-1 \
  --query 'services[0].{desired:desiredCount,running:runningCount}' \
  --output table"
**/

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = 'https://api.certshack.com';

export const options = {
  stages: [
    { duration: '2m', target: 80 },   // ramp up
    { duration: '6m', target: 80 },   // sustain — alarm needs 2 × 1-min breaches
    { duration: '2m', target: 0  },   // ramp down
  ],
  thresholds: {
    http_req_failed:   ['rate<0.10'],  // tolerate up to 10% errors during scale-out
    http_req_duration: ['p(95)<5000'], // 5s p95 is fine for this test
  },
};

// Spread VUs across a /16 so each "client" has its own rate-limit bucket.
// The ALB forwards X-Forwarded-For to Fastify, which uses req.ip as the key.
function spoofedIP(__vu) {
  const a = 10;
  const b = Math.floor((__vu - 1) / 255) % 255;
  const c = (__vu - 1) % 255;
  return `${a}.${b}.${c}.1`;
}

export default function () {
  const headers = { 'X-Forwarded-For': spoofedIP(__VU) };

  // Mix of endpoints — /exams hits DynamoDB and does more work than /health
  const endpoints = [
    `${BASE}/health`,
    `${BASE}/exams`,
  ];

  const url = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(url, { headers, timeout: '10s' });

  check(res, { 'status not 5xx': (r) => r.status < 500 });

  sleep(0.5);
}
