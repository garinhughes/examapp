# CLAUDE.md — backend/data

Exam and skill-lab JSON for **version control and local testing only**.

## Important

- Changes here **do not trigger GitHub Actions** (workflows exclude `backend/data/**`).
- Do not edit exam JSON directly — questions are authored in `../../../exam-generator/`, IDs assigned there, then merged in here before publishing.

## Publish Commands

```bash
cd backend

# Exams
pnpm publish:exams        # publish to S3 + DynamoDB
pnpm publish:exams:dry    # dry run (no writes)

# Skill labs
pnpm publish:skill-labs       # publish to S3 + DynamoDB
pnpm publish:skill-labs:dry   # dry run
```

Requires `aws-sso-login certshack` first. Always confirm before publishing.

## Toggle Source (local vs S3)

Set `SKILL_LAB_SOURCE=local` in `.env` to serve skill-lab data from `data/skill-labs/` instead of S3 during local development.
