import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <p className="wordmark text-5xl">Rivet</p>
        <p className="mt-3 text-sm text-[var(--muted)]">Sign in to run a review.</p>
        <div className="mt-8">
          <AuthView path={path} />
        </div>
      </div>
    </main>
  );
}
