# Safe AI Generation Workflow for Certification Practice Questions

Last Updated: 2026-02-16

## Purpose

This document defines the compliance, legal, and quality safeguards
required when generating certification-style practice questions using
AI. It ensures content does NOT violate: - Copyright laws -
Certification program agreements - Trademark policies - Intellectual
property protections - Payment processor compliance requirements

------------------------------------------------------------------------

# 1. Source Control Policy

## Allowed Sources

AI-generated questions may ONLY be derived from: - Official public
documentation - Official exam guides (domain blueprints only) - Public
whitepapers - Public FAQs - Public best-practice guides - Public pricing
and feature documentation

## Prohibited Sources

The system must NEVER use: - Exam dumps or brain dump websites - Leaked
exam PDFs - Screenshots of live exams - Reddit posts recalling real exam
questions - Telegram/Discord groups sharing "actual exam questions" -
User-submitted "real exam questions"

If contaminated data is ever ingested, the dataset must be discarded.

------------------------------------------------------------------------

# 2. Blueprint-Driven Generation

Questions must be generated from exam domains, not from specific known
questions.

Example: - Domain: Design Resilient Architectures - Services: EC2, ALB -
Focus: Multi-AZ deployments

Questions must test skills and understanding, not memorized trivia.

------------------------------------------------------------------------

# 3. Originality Safeguards

## A. Structure Requirements

Questions must: - Be scenario-based - Include constraints - Present
realistic business contexts - Require reasoning and tradeoff analysis -
Avoid definition-only recall questions

## B. Similarity Detection

Before publication: - Run semantic similarity checks against internal
blacklist corpuses - Reject content above defined similarity threshold

## C. Regeneration Rule

Never publish first-pass AI output directly. All content must pass
through: - Rewriting layer - Distractor regeneration - Explanation
validation

------------------------------------------------------------------------

# 4. Required Schema Fields

Please refer to the schema in file: question.schema.json (current directory)

------------------------------------------------------------------------

# 5. Marketing & Representation Rules

The platform must NOT use: - "Real exam questions" - "Actual AWS/Azure
exam questions" - "Guaranteed pass" - "100% identical to exam"

Allowed phrasing: - "Original practice questions" - "Exam-style
scenarios" - "Aligned to official exam guide"

Required Disclaimer: This product is not affiliated with or endorsed by
any certification provider. All questions are original and created for
practice purposes only.

------------------------------------------------------------------------

# 6. AI Prompt Guardrails

System prompt must enforce: - No reproduction of real exam questions -
No claims of official status - Use only public documentation knowledge -
Generate original scenarios

------------------------------------------------------------------------

# 7. Human Review Policy

-   Weekly random audit (5--10% minimum)
-   Remove suspicious or overly specific content
-   Validate explanations for instructional value
-   Confirm domain alignment

If content feels memorization-based or matches known phrasing, delete
it.

------------------------------------------------------------------------

# 8. Risk Indicators (Red Flags)

Your platform may be labeled a "dump site" if: - Questions are short and
trivia-based - Wording matches known dump phrasing - Marketing implies
real exam access - Content focuses on memorization

You are operating safely if: - Questions are scenario-driven -
Explanations teach concepts - Content tests reasoning - All sources are
publicly documented

------------------------------------------------------------------------

# 9. Data Integrity Principle

AI-generated content is compliant IF: - It is novel - It is based on
public knowledge - It does not reproduce proprietary exam material

Risk arises ONLY if: - The model is trained or fine-tuned on leaked
content - Proprietary material is reproduced

------------------------------------------------------------------------

# 10. Enforcement

Any violation of this workflow requires: - Immediate content removal -
Root cause investigation - Dataset review - Process correction

Compliance is mandatory for all AI-generated content.
