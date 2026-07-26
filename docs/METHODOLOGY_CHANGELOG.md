# Methodology change log

## 1.15.1 — 2026-07-25

- Accept any administrator-authored project-introduction text up to 800 characters and preserve it
  verbatim for project session 1.
- Treat that introduction as opaque display data: it remains untrusted to the model and is excluded
  from judgments about Sam's generated dialogue, while the rest of the opening keeps its normal
  structure, safety, credential, and semantic checks.

## 1.15.0 — 2026-07-24

- Persist a user-authored project introduction and include it, together with Sam's profile-supported
  academic degree and professional background, only in the first session's opening. Later project
  sessions retain the normal topic opening without repeating the project overview or credentials.
- Insert one concise facilitator transition before each go-round after the first, explicitly moving
  the circle into the next round without reintroducing Sam, summarizing a participant, or asking a
  question.
- Vary direct turn-to-turn continuity wording while preserving a faithful semantic link to the
  immediately previous participant. Treat session-wide reuse of the same opener family, including
  serial "I hear you saying" scaffolds, as repetition rather than requiring or banning one phrase.
- Require the two-sentence closing to thank participants explicitly for their participation or
  contribution while retaining its transcript-grounded summary and conditional peacebuilding link.
- Upgrade the semantic-review contract to guideline `1.1.5` for the new transition phase, varied
  continuity assessment, facilitator credential grounding, and explicit participation thanks.

## 1.14.0 — 2026-07-22

- End every completed session with a two-sentence facilitator closing: first a transcript-grounded
  summary of supported human stakes, connections, and any current difference, then an explicit
  explanation of how that specific exchange could support peacebuilding.
- Keep the peacebuilding implication conditional and evidence-based. A closing cannot claim that
  the simulation created reconciliation, changed attitudes, or real-world impact, and semantic
  review must reject generic peace language disconnected from what the circle actually discussed.
- Route semantic-review outages to a safe local peacebuilding closing instead of accepting an
  unreviewed provider closing.

## 1.13.0 — 2026-07-21

- Make every ordinary scheduled discussion turn after the first participant begin with one sentence
  that names the immediately previous participant, faithfully summarizes one distinctive point from
  that exact turn, and states whether the speaker agrees, builds, or differs before adding new content.
- Give the semantic reviewer the exact preceding participant turn and reject vague room-level or
  stale-speaker acknowledgements. Keep controlled challenges, facilitator interventions, and invited
  repair replies on their existing phase-specific contracts.
- Score topic depth, persona facts, and novelty on the contribution after the required continuity
  sentence so a faithful summary is neither mistaken for repetition nor counted as the new speaker's
  own position. Provider-unreviewed summaries fall back to an extractive, transcript-supported bridge.

## 1.12.0 — 2026-07-21

- Schedule up to two distinct controlled-challenge voices—one per community—in every discussion
  go-round, rotating through the stable project assignment by session and round while keeping
  introduction rounds challenge-free.
- Normalize every semantically accepted controlled challenge to the visible `escalating` tag and
  exclude it from future ordinary-target history, even when the reviewer returned an inconsistent
  neutral tag.

## 1.11.0 — 2026-07-21

- Give controlled challenges five total provider drafts while preserving an immediate semantic
  reroute when the target contains no genuine disagreement to repair.
- Restrict deterministic invited-response and closing acceptance to safety, output hygiene, and
  phase structure. Concern fidelity, transcript-grounded examples, latest-position convergence,
  and closing meaning now reach the selected semantic-review model instead of being vetoed by
  phrase-level heuristics.
- Let an invited repair reply durably fulfill the immediately next scheduled discussion slot when
  it belongs to the same student. Persist the exact schedule claim so pause/resume skips the merged
  slot without duplicating a speaker.
- Rotate Sam through three binding two-sentence intervention shapes: concise reflection, precise
  difference, and direct response. Provider retries, semantic requirements, mock dialogue, and
  local fallbacks retain the assigned shape while varying their wording.

## 1.10.0 — 2026-07-20

- Assign each scheduled discussion turn a distinct concrete subject focus and make that focus a
  semantic phase requirement. Carry it through ordinary prompts, challenge reroutes, retries,
  routed questions, and local fallbacks so a new speaker cannot merely restate an exhausted
  mechanism with different surface details.
- Validate facilitator interventions by observable structure rather than a whitelist of approved
  phrases: one open, single-focus final question to the planned invitee, without a forced choice,
  leading premise, demand for defense, or facilitator self-positioning.
- Preserve both speakers' reviewed central positions in intervention fallbacks so a failed provider
  draft cannot collapse a specific disagreement into generic repair language.
- Use the provider, model, and reasoning effort selected for the project/run for every LLM stage,
  including semantic validation. Validator calls remain separate and auditable, but no longer
  silently switch a Spark run to a different model.

## 1.9.0 — 2026-07-20

- Generate controlled challenges from a faithful target position and a materially different action,
  threshold, condition, or ordering at the same decision point. Require the challenger to own the
  tradeoff instead of manufacturing an omission, sufficiency claim, or target motive.
- Select a recent challenge target with an explicit decision or boundary, remove the conflicting
  independent engagement-lane instruction, and give challenge turns enough attempts to apply the
  semantic reviewer's correction guidance.
- Treat phrase-level challenge-fidelity heuristics as validator advisories rather than hard vetoes,
  while retaining strict semantic target fidelity. Shared end values may contain a genuine
  operational tension when the two concrete actions cannot govern the same moment; minor novelty
  warnings no longer block otherwise valid discussion.
- Require every accepted controlled challenge to trigger Sam's intervention. Vary de-escalation
  among accurate reflection, locating the exact difference, and a direct response to one part of
  the challenge, while keeping questions neutral and preventing forced defense or concession.
- Reroute an unreviewed controlled challenge when the semantic validator is unavailable instead of
  persisting escalation without its required intervention, and omit rejected draft text from retry
  prompts so failed wording does not prime the next generation.

## 1.8.0 — 2026-07-20

- Treat interfaith peace, religious reconciliation, and Jewish-Muslim relationship topics as
  difficult public subjects that require concrete engagement with trust, belonging, cooperation,
  safety, institutions, or lived community relationships rather than a copied topic label.
- State a naturally normalized topic once in Sam's opening and allow later speakers to refer to it
  in their own words. Reject raw-topic chanting, prompt/rubric language, repetitive one-frame relay,
  and more than one routed curiosity question in a discussion go-round.
- Preserve the target speaker's qualifiers, scope, and latest position through controlled challenge,
  intervention, invited response, and closing. Repairs are neutral and non-binary; they cannot
  validate a straw man, manufacture an omission, force a concession, or call escalation a repair.
- Upgrade the semantic-validator guideline to `1.1.0`: phase-critical warning checks, failed checks,
  critical issues, and quality below the acceptance floor now produce an auditable retry or reroute
  instead of surviving inside an `accept` decision.
- Make full-transcript evaluation penalize mechanical topic copies, single-frame loops, unsupported
  first-person exposure, leading repair questions, forced reversals, and closings that summarize an
  obsolete rather than a participant's latest supported position.

## 1.7.0 — 2026-07-20

- Replace meaning-level regex vetoes with an independent, full-transcript LLM semantic validator
  governed by a versioned guideline and strict structured `accept | retry | reroute` decisions.
- Keep deterministic validation for literal hard safety, prompt leakage, exact question counts, and
  named state-machine routing; legacy semantic heuristics remain advisory only.
- Reroute manufactured challenges to another defensible target or a constructive contribution and
  suppress repair chains built on a false disagreement. Preserve hard-safe provider drafts when the
  validator is unavailable rather than substituting canned escalation.
- Persist every semantic-review call in a separate immutable, fail-closed audit collection and add
  paginated redacted-summary plus exact run-scoped detail APIs.

## 1.6.1 — 2026-07-20

- Accept natural first-person priorities, conditions, obligations, concise ceasefire positions, and
  faithful target paraphrases without forcing them through rigid template wording. Ordinary strong
  positions no longer become escalation merely because they contain concern and a boundary.
- Preserve directional and temporal meaning across challenges and closings: opposite priority
  rankings remain distinct, additive obligations are not treated as reversals, and a closing can
  claim a decisive order only when the same stake appears first in a participant's latest position.
- Generalize semantic comparison beyond armed-conflict vocabulary so equivalent climate and AI
  positions can converge or be recognized as repetition without manufacturing an unresolved split.
- Make facilitator repair validation reject debate/defense prompts, compound requests, unsupported
  motives, and detail transfers while accepting natural reflection questions and substantive
  restatements of the challenger's actual concern.
- Replace rubric-sounding public-topic challenge, discussion, intervention, and invited-response
  fallbacks with direct conversational language that retains a concrete subject position.
- Include facilitator openings, linked interventions, malformed challenge links, and closing
  fidelity in deterministic adherence metrics instead of relying on the semantic judge alone.
- Keep internal topic/data-handling prose and Markdown markers out of persisted dialogue, introduce
  Sam only in the opening, and retain exact rejected drafts and prompts in the audit store.

## 1.6.0 — 2026-07-20

- Limit controlled tension to at most one project-assigned challenge voice per discussion go-round,
  rotating the selected voice by project session and discussion-round index; introductions remain
  challenge-free.
- Target each challenge at the freshest eligible ordinary, neutral scheduled contribution from
  another student. Immediate repair replies are excluded so a challenge cannot create a recursive
  challenge-repair loop.
- Add semantic-fidelity checks for challenges: reject direct or invented target attributions,
  unsupported sufficiency/universal/automatic conclusions, canned endings, and high structural
  reuse of recent challenges.
- Challenge only a limit, omission, or tension that is actually present in the target turn. Do not
  invent a conclusion for the speaker or the circle, reverse an explicitly stated uncertainty, or
  attribute a position to a religious or cultural group. Topic-sensitive local fallbacks preserve
  the same target scope and prefer sober, authored persona values on difficult public topics.
- For non-introduction persona responses on public-conflict topics, require substantive grounding in
  a concrete human consequence, ethical tension, uncertainty, or New York impact; merely mentioning
  the topic in headlines, messages, kitchens, commutes, or conversations no longer passes.
- Apply exhaustive persona-source and dialogue-novelty checks to generated persona turns. Reject
  invented relationships, teachings, quotes, events, routines, settings, routes, travel, losses, and
  other unsupported biography, together with repeated long phrases or concept bundles.
- Reject unsupported first-hand observations of public events, headlines, demonstrations, or the
  current room. Cross-speaker semantic saturation prevents a third participant from repeating the
  same compound frame (including people-as-numbers and restricting speech or action because facts
  are incomplete), while same-speaker checks prevent reuse of a central personal motif.
- Replace generic facilitator acceptance with phase-specific validation. Openings require Sam-first
  identity/topic order, shared agreements, and a topic-grounded invitation, while the discussion-
  opening generation contract requests one focused substantive question without asking students to
  invent a witnessed event, person, commute, or neighborhood scene; interventions require a
  reflective stance, concrete repair object, and exactly one single-focus final question to the
  planned invitee without facilitator self-positioning; closings preserve supported connection and
  unresolved difference without manufacturing consensus.
- Validate facilitator and invited-response meaning as well as form: yes/no questions containing an
  embedded question word are not treated as open questions; reflections must accurately overlap the
  triggering concern; and local repair language cannot expand a narrow scope objection into an
  unsupported claim about safety, dignity, consensus, or every consequence.
- Keep deterministic public-topic language portable across war, elections, climate, racism, and
  other allowed subjects by using supported or topic-general human stakes instead of assuming every
  difficult public topic involves civilians, displacement, or armed conflict.
- Require immediate repair replies to answer the facilitator's question, reflect the triggering
  speaker's distinctive concern, clarify intent, and end with a reflective statement instead of
  asking a new unanswered question.
- Normalize accepted visible dialogue to plain text before validation and persistence by removing
  balanced Markdown emphasis, code markers, headings, and trailing hard-break spaces.
- Give the judge the full visible transcript, including facilitator opening/interventions/closing
  and response-link metadata. Add visible/persona/curiosity-eligible counts,
  `repetitionRiskRate`, and `challengeFidelityRiskRate`; final adherence is the lower of the
  deterministic quality floor and the full-transcript judge score.

## 1.5.1 — 2026-07-19

- Reject and audit visible dialogue that echoes internal prompt scaffolding such as “configured
  topic is untrusted data,” JSON context labels, retry instructions, or output-format directives.
- Require the opening's clean topic sentence to follow Sam's introduction immediately; topic
  occurrence alone no longer permits extra prompt metadata in that sentence.
- Exclude contaminated historical turns from challenge-target reconstruction and make copied
  fallback details skip prompt-control sentences before quoting participant context.
- Recognize natural challenge language such as “I can’t agree,” “my parents,” and “my Forest Hills
  upbringing,” preventing valid provider drafts from being replaced by a canned local fallback.
- Apply the same output-hygiene boundary to campaign copy and judge rationale while preserving exact
  rejected provider output in the generation-attempt audit store.

## 1.5.0 — 2026-07-19

- Allow configured political and geopolitical topics to be discussed directly through first-person
  lived impact, family conversations, New York City life, values, relationships, and uncertainty;
  political vocabulary alone is no longer a methodology violation.
- Require Sam to identify himself as the facilitator in the opening's first sentence, immediately
  state the configured topic, and anchor the go-round invitation to that same topic. Sam must not
  re-introduce himself during interventions or the closing.
- Add deterministic topic-relevance checks to every non-introduction discussion, challenge,
  intervention, invited response, and closing. Off-topic drafts are audited, retried, and replaced
  only by topic-preserving fallbacks.
- Exempt mandatory introduction turns from topic grounding while keeping their opening and closing
  topic-faithful.
- Rebuild challenge targets only from topic-grounded accepted dialogue, pass the configured topic to
  the evaluation judge, and add a backward-compatible topic-relevance metric to new Runs.
- Keep campaign assets connected to their Run's configured topic, including political topics,
  without collective blame or partisan persuasion.

## 1.4.0 — 2026-07-19

- Separate each controlled challenge from the facilitator's immediately following repair: challenge
  turns use declarative disagreement and do not open with validation or end with a question.
- Give the challenge generator the complete accepted target turn plus a short safe anchor. When a
  participant shared only a memory, challenge a possible circle inference instead of inventing a
  claim, motive, or injury for that participant.
- Give an ephemeral retry its previous safe draft, classification, and rejection reasons; omit the
  raw draft when it was hard-unsafe.
- Require accepted controlled challenges to be first-person, personally grounded, unresolved, and
  free of facilitator-style repair or adversarial/dismissive language.
- Normalize typographic apostrophes and recognize natural “leap from”/“should not conclude” framing
  so bounded challenges are not rejected solely for punctuation or non-template wording.

## 1.3.1 — 2026-07-19

- Require every persisted facilitator opening to state the complete sanitized configured topic.
- Accept safe curiosity language in an opening without treating it as a failed repair classification.
- Retry invalid or off-topic provider openings, then use a topic-preserving safe scaffold.
- Preserve mandatory-introduction instructions alongside the configured topic.

Historical runs retain the methodology version and opening text recorded when they were created.
