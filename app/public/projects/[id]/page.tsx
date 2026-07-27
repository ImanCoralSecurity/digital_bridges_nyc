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
            </p>
          </div>
        </div>
        {project.sessions.map((session) => (
          <PublicSession key={session.id} session={session} />
        ))}
      </section>
    </>
  );
}

function PublicSession({ session }: { session: PublicProjectSession }) {
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
              <div className={`turn ${turnClass}`} key={`${session.id}-${turn.index}`}>
                <div className="turn-head">
                  <span className="turn-speaker">{turn.speakerName}</span>
                  <Badge kind={turn.role === "facilitator" ? "gray" : turn.speakerGroup}>
                    {turn.role === "facilitator" ? "Facilitator" : capitalize(turn.speakerGroup)}
                  </Badge>
                  {turn.roundKind && (
                    <span className="meta">
                      {turn.roundNumber ? `Round ${turn.roundNumber} · ` : ""}
                      {turn.roundKind.replaceAll("-", " ")}
                    </span>
                  )}
                </div>
                <div className="turn-text"><InlineMarkdown text={turn.text} /></div>
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
