
# Safe AI Generation Workflow for Certification Practice Questions

Last Updated: 2026-02-18

## Purpose

This document defines the compliance, legal, and quality safeguards
required when generating certification-style practice questions using
AI. It ensures content does NOT violate public exam policies, copyright
or proprietary exam content and that generated questions are high
quality, instructive, and human-readable.

------------------------------------------------------------------------

## Key Additions — Humanizing Questions

To make questions feel human and natural while remaining exam-aligned:
- Use a lightweight persona or vignette: "You're a security engineer at
	Acme Corp..." to ground the scenario.
- Prefer active, conversational phrasing over formal, robotic wording.
- Vary openings (e.g., situation, goal, constraint) between questions
	to avoid repetitive patterns.
- Use plausible distractors that a real engineer might consider, not
	obviously false options.
- Keep choices concise and conversational; explanations should teach,
-	not just repeat the doc text.

Avoid overuse of second-person openings

- Do not start more than roughly 25% of a question set with direct
	second-person phrasing ("You", "You're", "Your"). Rotate between
	vignette, neutral, and question-first templates to keep tone varied
	and reduce repetition. When editing or reviewing generated questions,
	ensure openings alternate templates and maintain readability.

Prompt templates (example):

- Short vignette template:
	"You're a security engineer at a company that needs to X. Given
	constraint Y, which AWS service or configuration would you choose?"
- Direct reasoning template:
	"Which of the following best explains why you'd prefer A over B in
	a scenario where Z applies?"

When generating or editing questions, include a human-friendly `tip`
and a short `explanation` that helps the learner understand tradeoffs.

------------------------------------------------------------------------

# 1. Source Control Policy

## Allowed Sources

AI-generated questions may ONLY be derived from:
- Official public documentation
- Official exam guides (domain blueprints only)
- Public whitepapers and best-practice guides
- Public FAQs and product documentation

## Prohibited Sources

The system must NEVER use:
- Exam dumps, leaked exam content, or recollected question lists
- Screenshots or locked PDFs of proprietary exam items
- Community-shared "actual exam" questions that reproduce exam
	content

If contaminated data is ever discovered, the dataset must be cleaned
and offending items removed.

------------------------------------------------------------------------

# 2. Blueprint-Driven Generation

Questions must be derived from domain-level objectives and service
capabilities, not from specific known exam items.

Example: Domain: Design Resilient Architectures — Focus: Multi-AZ
deployments

Questions must test reasoning, not memorization.

------------------------------------------------------------------------

# 3. Originality Safeguards

## A. Structure Requirements

Questions must:
- Use short vignette-style scenarios where appropriate
- State constraints and expected outcomes
- Require tradeoffs, justification, or selection based on a scenario
- Avoid verbatim copying of official phrasing

## B. Similarity Detection

Before publication:
- Run semantic similarity checks against internal blacklists and known
	exam leaks
- Reject or rewrite content that exceeds similarity thresholds

## C. Regeneration Rule

Never publish first-pass AI output directly. All content must pass
human editing that includes:
- Rewriting for tone and realism
- Distractor review and regeneration
- Explanation validation for teaching value

------------------------------------------------------------------------

# 4. Required Schema Fields

Please refer to the schema in file: question.schema.json (current
directory). Suggested additional fields for humanized content:
- `tone`: "conversational" | "neutral" | "formal"
- `persona`: short string to describe vignette (optional)
- `generationHints`: optional field at exam level for consistent tone

------------------------------------------------------------------------

# 5. Marketing & Representation Rules

The platform must NOT use:
- "Real exam questions" or suggest reproduction of an actual test
- Claims of official affiliation or guaranteed pass rates

Use allowed phrasing: "Original practice questions", "Exam-style
scenarios", "Aligned to official exam guide"

------------------------------------------------------------------------

# 6. AI Prompt Guardrails

System prompt must enforce:
- No reproduction of real exam questions
- Use only allowed public documentation
- Produce scenario-first phrasing where possible
- Return at least one plausible distractor that reflects a common
	operational mistake

Example AI instruction snippet:
"Produce one multiple-choice question aligned to domain X. Start with
 a short, realistic vignette (one sentence). Use conversational
 phrasing, include four options with one correct answer, and add a
 concise teaching explanation and tip. Avoid copying exact sentences
from source docs."

------------------------------------------------------------------------

# 7. Human Review Policy

- Weekly random audit (5–10% minimum)
- Rewriter review for tone and realism
- Distractor plausibility checks
- Explanation accuracy and teaching value checks

If content appears memorization-based or too similar to known sources,
remove and regenerate.

------------------------------------------------------------------------

# 8. Risk Indicators (Red Flags)

You may be flagged as a dump site if:
- Questions are single-sentence trivia items
- Wording matches known leaked phrasings
- Marketing implies access to real exam content

Indicators of healthy content:
- Scenario-driven questions
- Explanations that teach concepts and tradeoffs
- Plausible distractors and varied language

------------------------------------------------------------------------

# 9. Data Integrity Principle

AI-generated content is compliant if:
- It is novel and grounded in public knowledge
- It does not reproduce proprietary exam material

------------------------------------------------------------------------

# 10. Enforcement

Any confirmed violation requires:
- Immediate removal
- Root-cause analysis and dataset review
- Process correction and retraining of generation prompts

Compliance is mandatory for all AI-generated content.
