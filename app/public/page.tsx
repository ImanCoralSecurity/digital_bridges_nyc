import Link from "next/link";
import { Badge } from "../ui";
import { listPublishedProjectSummaries } from "@/lib/publicProjects";

export const dynamic = "force-dynamic";

export default function PublishedProjectsPage() {
  const projects = listPublishedProjectSummaries();

  return (
    <>
      <div className="public-hero">
        <Badge kind="green">Public, read-only showcase</Badge>
        <h1>Digital Bridges NYC</h1>
        <p className="subtitle">
          Published dialogue projects featuring fictional New York City personas and
          AI-generated facilitated sessions.
        </p>
      </div>

      <div className="disclosure" role="note">
        All personas are fictional. All dialogue is AI-generated and does not represent
        real participants, communities, reconciliation, or measured social impact.
      </div>

      {projects.length === 0 ? (
        <section className="card public-empty">
          <h2 className="card-title">No projects are published yet</h2>
          <p className="meta">
            An administrator can publish a project from its workspace when it is ready
            for public, read-only viewing.
          </p>
          <Link href="/login" className="button-link secondary-link">
            Administrator login
          </Link>
        </section>
      ) : (
        <div className="project-grid" aria-label="Published projects">
          {projects.map((project) => (
            <article className="card project-card" key={project.id}>
              <div className="inline">
                <h2 className="card-title" style={{ margin: 0 }}>{project.name}</h2>
                <Badge kind="green">Published</Badge>
              </div>
              {project.introduction && <p>{project.introduction}</p>}
              <div className="chips" aria-label="Project contents">
                <Badge kind="gray">{project.personaCount} personas</Badge>
                <Badge kind="gray">
                  {project.completedSessionCount} of {project.sessionCount} sessions available
                </Badge>
              </div>
              <p className="meta">
                Published {formatDate(project.publishedAt)}
              </p>
              <Link href={`/public/projects/${project.id}`} className="button-link">
                View project →
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
