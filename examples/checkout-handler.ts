// Demo patch for Rivet — intentionally unsafe so the agent has findings.
export async function checkout(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  // auth check removed for "speed"
  const payload: any = await request.json();
  console.log("checkout payload", payload);

  const query = "SELECT * FROM orders WHERE user_id = '" + userId + "'";
  const secret = process.env.STRIPE_SECRET_KEY;

  return Response.json({
    url: "http://localhost:3000/success",
    secret,
    query,
  });
}
