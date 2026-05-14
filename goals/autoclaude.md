# AutoClaude Ideas

Ideas for Claude-powered automation and learner features, using the Anthropic Agent SDK (available via Claude Max 5x plan from June 15, 2026).

---

## For the creator

### Daily study guide monitor
A scheduled Claude agent that watches certification pages (Microsoft, AWS, CompTIA) for new or updated exam guides. On detection:
1. Downloads the new guide
2. Auto-formats it to the `guides/` convention in exam-generator
3. Opens a PR with the new guide file + a draft exam JSON shell ready to go

Wake up, review the PR, and the pipeline is ready to run. Use the `/schedule` skill to set this up as a daily remote agent.

### Automated pipeline trigger
Since the exam-generator pipeline is already Claude-driven, automate the full run for a given exam:
- Loop every skill in a guide, run `generate.py prompt --batch`, feed to Claude via SDK, save to `reviews/`, validate, and merge
- Still review questions in the local viewer, but generation becomes a single command rather than manual per-skill work

### Quality agent
Post-merge, a Claude pass over the full exam JSON checking for:
- Duplicate questions
- Ambiguous distractors
- Answers that are too obviously wrong
- Coverage gaps by domain

Flags issues as a report rather than auto-fixing.

---

## For learners (Pro Plus gated, N requests/day)

### Adaptive exam mode
After a full practice exam, Claude analyses results and generates a personalized "weak areas" mini-exam — 10 questions targeting only domains where the learner scored below 70%. Re-tests exactly what they got wrong.

### "Explain like I'm new to AWS"
Per-question contextual explainer that adjusts depth based on exam level (Associate vs Specialty). SC-300 candidates get a different explanation depth than SCS-C03 candidates.

### Lab-to-exam linking
"This skill lab covers IAM roles — here are the 3 exam questions from your practice exams that test the same concept." Connects hands-on labs to exam outcomes so learners understand *why* they're doing a lab.

### Study streak + progress nudges
Daily digest email via SES: "You haven't studied SC-300 in 4 days. Your exam is in 12 days. Here's your weakest domain." Simple but high-retention.

### Pre-exam readiness score
Before sitting a real exam, Claude analyses practice history across all attempts and gives a confidence score by domain — "You're ready in 4/6 domains. Focus another 2 hours on Domain 3 before sitting."

---

## Mobile app — exam companion

A companion to examapp, not a replacement. The web app owns skill labs and deep content; the mobile app owns **daily habits and exam prep on the go**. No skill labs on mobile — focused on exams and learning plans.

### Commuter-first exam experience

**Quick-fire mode**
5 or 10 question bursts optimised for a commute or lunch break. No full 65-question slogs — targeted practice that fits real life.

**Offline support**
Cache a question bank locally. No signal on the tube? Still study. Sync results when back online.

**Swipe to answer**
Native gesture-driven UI — swipe right for confident, left to flag for review. Faster than tapping radio buttons.

**Domain drill**
Pick a single domain and hammer it. "I have 10 minutes, test me on IAM only."

### Claude features on mobile

**Daily question with explanation**
Push notification each morning: one question, tap to answer, Claude explains why. Builds a habit without overwhelming. Costs 1 request, high perceived value.

**Voice explanation**
Answer a question, tap "explain this to me" — Claude responds in plain language, TTS reads it aloud. Perfect for commuters.

**"Am I ready?" check-in**
One tap, Claude looks at your last 7 days of activity and gives an honest readiness verdict with a specific recommendation. High value, single request.

### Learning plan on mobile

**Exam countdown widget**
Set your exam date, the widget shows days remaining + today's suggested focus domain based on weak areas.

**Daily study goal**
"Do 10 questions today." Simple streak mechanic. Claude generates the 10 questions tailored to current weak spots rather than random picks.

**Progress timeline**
Visual chart of score by domain over time — where you started vs where you are. Motivating for learners who've been grinding.

### Monetisation angle

Mobile is the **top of funnel** — free with 5 questions/day, no Claude. Upsell to Pro Plus on web for unlimited practice, labs, and AI features. Mobile is the hook, examapp is the conversion.

### Tech notes

React Native + Expo would allow reuse of a lot of frontend logic and Tailwind-style patterns. Cognito auth, DynamoDB, and the existing API all carry over with minimal changes.

---

## Marketing automation (human in the loop)

### LinkedIn auto-posting
Claude drafts posts about new exams published, learner milestones, or certification news. Human reviews and posts manually — saves the writing time without the reputational risk of fully autonomous posting.

Options when ready to automate further:
- **Zapier/Make bridge** — Claude writes content, webhook triggers Zapier, Zapier posts to LinkedIn. Easiest path.
- **LinkedIn API direct** — requires OAuth + app approval, more friction but no third-party dependency.

Start with Claude drafting to a file/clipboard, graduate to Zapier when volume justifies it.

### Reddit certification monitoring
A daily Claude agent that scans relevant subs for people struggling to find good practice exam apps:

**Subreddits to watch:** r/AWSCertifications, r/CompTIA, r/microsoft, r/ccna, r/sysadmin, r/ITCareerQuestions

**Signal to look for:** posts containing "practice exam", "question bank", "study app", "can't find good questions", "any recommendations for", "where do I find practice questions" etc.

**Output:** a daily digest — post title, link, subreddit, and a suggested reply drafted by Claude that you can personalise and post yourself.

Stays authentic — you reply as a human with context, not a bot. Reddit rewards genuinely helpful replies; this just makes it easy to find the right moments.

**Tech:** Python `praw` library + Reddit public API. Straightforward to set up as a scheduled agent.

---

## Scoping / abuse prevention notes
- Expose structured AI actions (`/ai/explain-answer`, `/ai/hint`, `/ai/study-plan`), not a generic chat box
- Backend injects context (question ID, exam domain, lab step) — users can't submit arbitrary prompts
- System prompt locks Claude to study/exam scope only
- Rate limit per Cognito user in DynamoDB, gated on subscription tier
- Return upsell message when daily limit is hit
