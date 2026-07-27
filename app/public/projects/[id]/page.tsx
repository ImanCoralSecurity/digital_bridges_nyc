import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge, InlineMarkdown, Tile } from "../../../ui";
import { getPublishedProject, type PublicProjectSession } from "@/lib/publicProjects";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };
const loadPublishedProject = cache(getPublishedProject);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const project = loadPublishedProject(id);
  return project
    ? {
        title: `${project.name} | Digital Bridges NYC`,
        description: `Read ${project.completedSessionCount} published AI-generated dialogue sessions featuring ${project.personaCount} fictional New York City personas.`,
      }
    : { title: "Published project not found | Digital Bridges NYC" };
}

export default async function PublicProjectPage({ params }: PageProps) {
  const { id } = await params;
  const project = loadPublishedProject(id);
  if (!project) notFound();

  const muslim = project.personas.filter((persona) => persona.group === "muslim").length;
  const jewish = project.personas.filter((persona) => persona.group === "jewish").length;
  const personaNameById = new Map(
    project.personas.map((persona) => [persona.id, persona.displayName]),
  );

  return (
    <>
      <p className="meta"><Link href="/public">← Published projects</Link></p>

      <div className="public-hero">
        <div className="inline">
          <Badge kind="green">Published project</Badge>
          <Badge kind="amber">AI-generated dialogue</Badge>
        </div>
        <h1>{project.name}</h1>
        {project.introduction && <p className="public-introduction">{project.introduction}</p>}
      </div>

      <div className="disclosure" role="note">
        This is a research simulation. Every participant profile is fictional and every
        session response is AI-generated. The material does not report real testimony,
        community consensus, reconciliation, or measured social impact.
      </div>

      <div className="grid grid-3 public-stats">
        <Tile label="Fictional students" value={project.personaCount} sub={`${muslim} Muslim · ${jewish} Jewish`} />
        <Tile label="Sessions available" value={`${project.completedSessionCount} / ${project.sessionCount}`} />
        <Tile label="Access" value="Read only" sub="Editing is available in the private project workspace" />
      </div>

      <p className="public-skip-link"><a href="#sessions-heading">Skip to session transcripts ↓</a></p>

      <section aria-labelledby="personas-heading">
        <div className="section-head">
          <div>
            <h2 id="personas-heading">Student personas</h2>
            <p className="meta" style={{ margin: 0 }}>
              Fictional New Yorkers who participate throughout this project.
            </p>
          </div>
        </div>
        <div className="grid grid-2 public-persona-grid">
          {project.personas.map((persona) => (
            <details className="card public-persona" key={persona.id}>
              <summary>
                <span className="public-persona-name">{persona.displayName}</span>
                <Badge kind={persona.group}>{capitalize(persona.group)}</Badge>
                <span className="meta">Raised in {persona.raisedIn}</span>
              </summary>
              <dl className="public-profile">
                <div>
                  <dt>Family background</dt>
                  <dd>{persona.background}</dd>
                </div>
                <div>
                  <dt>Regional micro-history</dt>
                  <dd>{persona.regionalHistory}</dd>
                </div>
                <div>
                  <dt>Cultural baseline</dt>
                  <dd>{persona.culturalBaseline}</dd>
                </div>
                <div>
                  <dt>Values</dt>
                  <dd>{persona.values.join(" · ")}</dd>
                </div>
                <div>
                  <dt>Communication style</dt>
                  <dd>{persona.communicationStyle}</dd>
                </div>
              </dl>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="sessions-heading">
        <div className="section-head">
          <div>
            <h2 id="sessions-heading">Sessions</h2>
            <p className="meta" style={{ margin: 0 }}>
              These completed transcripts were captured in the project&apos;s current public snapshot and are read only.
              Labels show automated dialogue annotations and generation provenance within this fictional simulation.
            </p>
          </div>
        </div>
        {project.sessions.map((session) => (
          <PublicSession
            key={session.id}
            session={session}
            personaNameById={personaNameById}
          />
        ))}
      </section>
    </>
  );
}

function PublicSession({
  session,
  personaNameById,
}: {
  session: PublicProjectSession;
  personaNameById: ReadonlyMap<string, string>;
}) {
  const turnId = (turn: PublicProjectSession["turns"][number]) =>
    turn.id ?? `${session.id}-turn-${turn.index}`;
  const availableTurnIds = new Set(
    session.turns.map((turn) => turn.id).filter((id): id is string => Boolean(id)),
  );
  const invitedResponseByInterventionId = new Map(
    session.turns
      .filter((turn) => turn.invitedByTurnId)
      .map((turn) => [turn.invitedByTurnId as string, turn]),
  );

  return (
    <article id={session.id} className="card public-session">
      <div className="section-head compact">
        <div>
          <div className="inline">
            <h3 style={{ margin: 0 }}>Session {session.number}</h3>
            <Badge kind="green">Published transcript</Badge>
          </div>
          {session.topic && <p className="public-session-topic">{session.topic}</p>}
        </div>
        {session.rounds !== null && <span className="meta">{session.rounds} rounds</span>}
      </div>

      <details className="public-transcript">
        <summary>Read transcript ({session.turns.length} turns)</summary>
        <div className="public-transcript-body">
          {session.turns.map((turn) => {
            const turnClass = turn.role === "facilitator"
              ? "facilitator"
              : turn.speakerGroup === "muslim"
                ? "persona-a"
                : "persona-b";
            return (
              <div
                className={`turn ${turnClass}`}
                id={turnId(turn)}
                key={turnId(turn)}
              >
                <div className="turn-head">
                  <span className="turn-speaker">{turn.speakerName}</span>
                  <Badge kind={turn.role === "facilitator" ? "gray" : turn.speakerGroup}>
                    {turn.role === "facilitator" ? "Facilitator" : capitalize(turn.speakerGroup)}
                  </Badge>
                  {turn.roundNumber !== undefined && <Badge kind="gray">round {turn.roundNumber}</Badge>}
                  {turn.roundKind && <Badge kind="gray">{turn.roundKind}</Badge>}
                  {turn.controversialSpeaker && <Badge kind="amber">challenge voice</Badge>}
                  {turn.conversationTag === "escalating" && <Badge kind="red">escalating</Badge>}
                  {turn.conversationTag === "deescalating" && <Badge kind="green">de-escalating</Badge>}
                  {turn.compliant === false && <Badge kind="red">flagged</Badge>}
                  {turn.guardrailTrigger && <Badge kind="amber">guardrail</Badge>}
                  {(turn.regenerations ?? 0) > 0 && (
                    <Badge kind="gray">regenerated ×{turn.regenerations}</Badge>
                  )}
                  {turn.generationSource === "local-fallback" && (
                    <Badge kind="amber">local fallback</Badge>
                  )}
                  {turn.generationSource === "local" && (
                    <Badge kind="gray">local transition</Badge>
                  )}
                </div>
                <div className="turn-text"><InlineMarkdown text={turn.text} /></div>
                {turn.respondsToTurnId && availableTurnIds.has(turn.respondsToTurnId) && (
                  <div className="meta public-turn-link">
                    Challenge grounded in <a href={`#${turn.respondsToTurnId}`}>this earlier student turn</a>.
                  </div>
                )}
                {turn.triggeredByTurnId && availableTurnIds.has(turn.triggeredByTurnId) && (
                  <div className="meta public-turn-link">
                    Intervention for <a href={`#${turn.triggeredByTurnId}`}>the preceding escalating turn</a>.
                  </div>
                )}
                {turn.invitedSpeakerId && (
                  <div className="meta public-turn-link">
                    Invited {invitedResponseByInterventionId.get(turnId(turn)) ? (
                      <a href={`#${turnId(invitedResponseByInterventionId.get(turnId(turn))!)}`}>
                        {personaNameById.get(turn.invitedSpeakerId) ?? turn.invitedSpeakerId}
                      </a>
                    ) : (
                      personaNameById.get(turn.invitedSpeakerId) ?? turn.invitedSpeakerId
                    )} to answer immediately before the schedule continues.
                  </div>
                )}
                {turn.invitedByTurnId && availableTurnIds.has(turn.invitedByTurnId) && (
                  <div className="meta public-turn-link">
                    Response invited by <a href={`#${turn.invitedByTurnId}`}>this facilitator intervention</a>;
                    {turn.consumedScheduledRoundNumber
                      ? ` it also fulfilled the student’s scheduled contribution in go-round ${turn.consumedScheduledRoundNumber}.`
                      : " the student’s scheduled go-round turn is unchanged."}
                  </div>
                )}
                <div className="chips">
                  {(turn.flags ?? []).map((flag) => <Badge key={flag} kind="red">{flag}</Badge>)}
                  {turn.signals?.iStatement && <Badge kind="green">I-statement</Badge>}
                  {turn.signals?.personalHistory && <Badge kind="green">personal history</Badge>}
                  {turn.signals?.curiosityQuestion && <Badge kind="green">curiosity</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
