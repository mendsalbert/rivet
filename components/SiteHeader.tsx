import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { AuthUserButton } from "./AuthUserButton";
import { HeaderChrome } from "./HeaderChrome";

export async function SiteHeader() {
  const user = await getSessionUser();
  const authOn = isAuthConfigured();

  return (
    <HeaderChrome>
      <Link href="/" className="brand">
        Rivet
      </Link>
      <nav>
        <Link href="/reviews">Reviews</Link>
        <Link href="/install">Install</Link>
        {authOn && user && user.id !== "demo" ? (
          <AuthUserButton />
        ) : authOn ? (
          <Link href="/auth/sign-in">Sign in</Link>
        ) : (
          <span className="demo-chip">Local demo</span>
        )}
      </nav>
    </HeaderChrome>
  );
}
