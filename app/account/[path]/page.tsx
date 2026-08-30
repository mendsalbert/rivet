import { AccountView } from "@neondatabase/auth-ui";
import { accountViewPaths } from "@neondatabase/auth-ui/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(accountViewPaths).map((path) => ({ path }));
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="page-shell">
      <p className="page-kicker">Account</p>
      <h1 className="page-title">Settings</h1>
      <div className="mt-10 max-w-2xl">
        <AccountView path={path} />
      </div>
    </main>
  );
}
