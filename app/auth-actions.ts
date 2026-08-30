"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signInWithEmail(
  _prev: { error: string } | null,
  formData: FormData,
) {
  if (!auth) return { error: "Neon Auth is not configured yet. The demo is open without a login." };

  const { error } = await auth.signIn.email({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (error) return { error: error.message || "Could not sign in." };
  redirect("/reviews");
}

export async function signUpWithEmail(
  _prev: { error: string } | null,
  formData: FormData,
) {
  if (!auth) return { error: "Neon Auth is not configured yet. The demo is open without a login." };

  const { error } = await auth.signUp.email({
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (error) return { error: error.message || "Could not create the account." };
  redirect("/reviews");
}

export async function signOut() {
  if (auth) await auth.signOut();
  redirect("/");
}
