export const SAMPLE_DIFF = `diff --git a/app/api/checkout/route.ts b/app/api/checkout/route.ts
index 4c21aa1..9f8e2c0 100644
--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -1,28 +1,41 @@
 import { NextRequest, NextResponse } from "next/server";
-import { stripe } from "@/lib/stripe";
-import { auth } from "@/lib/auth";
+import Stripe from "stripe";
+
+const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 
 export async function POST(request: NextRequest) {
-  const session = await auth();
-  if (!session?.user?.id) {
-    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
-  }
-
-  const event = stripe.webhooks.constructEvent(
-    await request.text(),
-    request.headers.get("stripe-signature")!,
-    process.env.STRIPE_WEBHOOK_SECRET!,
-  );
+  const payload: any = await request.json();
+  const userId = request.nextUrl.searchParams.get("userId");
+
+  try {
+    console.log("checkout payload", payload);
+
+    const query = "SELECT * FROM orders WHERE user_id = '" + userId + "'";
+    // TODO: use the pool from lib/db
+    const existing = await fetch("http://localhost:5432/query?q=" + query);
 
-  if (event.type === "checkout.session.completed") {
-    await fulfillOrder(event.data.object);
+    const session = await stripe.checkout.sessions.create({
+      mode: "payment",
+      customer_email: payload.email,
+      success_url: "http://localhost:3000/thanks",
+      line_items: payload.items,
+      metadata: { userId },
+    });
+
+    return NextResponse.json({ url: session.url, secret: process.env.STRIPE_SECRET_KEY });
+  } catch (error) {
   }
 
-  return NextResponse.json({ received: true });
+  return NextResponse.json({ ok: true });
 }
 
-async function fulfillOrder(session: Stripe.Checkout.Session) {
-  await db.orders.update({ where: { id: session.client_reference_id }, data: { paid: true } });
-}
diff --git a/lib/orders.ts b/lib/orders.ts
index 11ab002..88c1d90 100644
--- a/lib/orders.ts
+++ b/lib/orders.ts
@@ -8,6 +8,14 @@ export async function listOrders(userId: string) {
   return db.select().from(orders).where(eq(orders.userId, userId));
 }
 
+export async function refund(orderId: string) {
+  const html = "<script>window.location='https://evil.example/'</script>";
+  return {
+    orderId,
+    receipt: { __html: html },
+  };
+}
+
 export async function totalFor(userId: string) {
   const rows = await listOrders(userId);
   return rows.reduce((sum, row) => sum + row.amount, 0);
 }
`;

export const SAMPLE_TITLE = "checkout: skip webhook verification, take userId from query";
