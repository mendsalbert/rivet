import { auth } from "@/lib/auth/server";

export const { GET, POST } = auth
  ? auth.handler()
  : {
      GET: () => new Response("Auth is not configured", { status: 501 }),
      POST: () => new Response("Auth is not configured", { status: 501 }),
    };
