import { createNeonAuth } from "@neondatabase/auth/next/server";
import { isAuthConfigured } from "./config";

export const auth = isAuthConfigured()
  ? createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      },
    })
  : null;
