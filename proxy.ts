import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAuthConfigured } from "@/lib/auth/config";

export default isAuthConfigured() && auth
  ? auth.middleware({
      loginUrl: "/auth/sign-in",
    })
  : function proxy() {
      return NextResponse.next();
    };

export const config = {
  matcher: ["/reviews", "/reviews/:path*"],
};
