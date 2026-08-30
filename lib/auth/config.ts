export function isAuthConfigured() {
  return Boolean(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
  );
}

export const DEMO_USER = {
  id: "demo",
  name: "Demo reviewer",
  email: "demo@rivet.dev",
};
