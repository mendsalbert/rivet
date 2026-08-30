import Link from "next/link";

const DIFF = `diff --git a/app/api/checkout/route.ts b/app/api/checkout/route.ts
--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -12,18 +12,24 @@
- const session = await auth();
- if (!session?.user?.id) return unauthorized();
+ const payload: any = await request.json();
+ const userId = request.nextUrl.searchParams.get("userId");
+ console.log("checkout payload", payload);
+ const query = "SELECT * FROM orders WHERE user_id = '" + userId + "'";
+ return NextResponse.json({
+   url: session.url,
+   secret: process.env.STRIPE_SECRET_KEY
+ });`;

export function DiffBackdrop() {
  return (
    <div className="hero-visual" aria-hidden>
      <div className="hero-diff">
        <span className="scan" />
        {DIFF.split("\n").map((line, index) => {
          const kind = line.startsWith("+")
            ? "add"
            : line.startsWith("-")
              ? "del"
              : line.startsWith("diff") || line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")
                ? "meta"
                : "";
          return (
            <div key={index} className={kind}>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="wordmark">Rivet</p>
          <h1>The agent that reads the diff.</h1>
          <p className="lede">
            Paste a pull request. Rivet walks the patch, cites the line, and writes the review.
          </p>
          <div className="cta">
            <Link href="/reviews/new" className="btn">
              Open the agent
            </Link>
            <Link href="/reviews/sample" className="btn btn-ghost">
              See a review
            </Link>
          </div>
        </div>
        <DiffBackdrop />
      </section>

      <section className="section">
        <h2>One patch. One pass.</h2>
        <p className="one">
          Rivet does not summarize the PR. It reads the unified diff and stops on the lines that can ship a bug.
        </p>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>Neon runs the whole stack.</h2>
        <p className="one">
          Auth for who owns the review. Object storage for the patch. A function that can think past a request
          timeout. Postgres for the verdict. One platform behind the agent — not just a database under it.
        </p>
        <div className="stack">
          <div className="stack-row">
            <strong>Auth</strong>
            <p>
              Managed Better Auth. Every review belongs to a person, and the function checks the JWT before it
              touches the patch.
            </p>
          </div>
          <div className="stack-row">
            <strong>Storage</strong>
            <p>
              The diff lives as a file in object storage — not jammed into a row — and branches with the rest of
              the project.
            </p>
          </div>
          <div className="stack-row">
            <strong>Functions</strong>
            <p>
              The agent runs on long-lived Node next to Postgres, so a tool loop is not cut off by a ten-second
              host.
            </p>
          </div>
          <div className="stack-row">
            <strong>Postgres</strong>
            <p>
              Verdict, findings, and ownership stay in Postgres. Still Neon — just one piece of what Neon is
              doing here.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
