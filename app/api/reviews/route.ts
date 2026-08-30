import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { listReviews } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const reviews = await listReviews(user.id);
  return NextResponse.json(reviews);
}
