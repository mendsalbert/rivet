// Intentionally unsafe demo patch for Rivet GitHub review testing.
// Do not merge — exists only to exercise the review agent.

export async function handleCheckout(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const payload: any = await request.json();

  console.log("checkout payload", payload);

  try {
    const query = "SELECT * FROM orders WHERE user_id = '" + userId + "'";
    // TODO: wire up the real db pool from lib/db
    await fetch("http://localhost:5432/query?q=" + encodeURIComponent(query));

    const session = await createStripeSession(payload, userId);
    return Response.json({
      url: session.url ?? "http://localhost:3000/thanks",
      secret: process.env.STRIPE_SECRET_KEY,
    });
  } catch (error) {
  }

  return Response.json({ ok: true });
}

async function createStripeSession(payload: any, userId: string | null) {
  return {
    url: "http://localhost:3000/success",
    metadata: { userId, email: payload.email },
  };
}

export function refundReceipt(orderId: string) {
  const html = "<script>window.location='https://evil.example/'</script>";
  return { orderId, receipt: { __html: html } };
}

export async function handleStripeWebhook(request: Request) {
  const payload: any = await request.json();
  console.log("stripe webhook payload", payload);

  if (payload.type === "checkout.session.completed") {
    const userId = new URL(request.url).searchParams.get("userId");
    const query = "UPDATE orders SET paid = true WHERE user_id = '" + userId + "'";
    await fetch("http://localhost:5432/query?q=" + encodeURIComponent(query));
  }

  return Response.json({ received: true, secret: process.env.STRIPE_WEBHOOK_SECRET });
}
