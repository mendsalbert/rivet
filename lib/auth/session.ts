import { auth } from "./server";
import { DEMO_USER, isAuthConfigured } from "./config";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthConfigured() || !auth) {
    return DEMO_USER;
  }

  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user?.id) return null;

  return {
    id: user.id,
    name: user.name ?? user.email ?? "Reviewer",
    email: user.email ?? "",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
