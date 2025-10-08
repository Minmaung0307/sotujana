import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// ❗️ Secret NAMEs ကိုသာ define လုပ်ပါ (VALUE မထည့်)
const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const CHAT_ID   = defineSecret("TELEGRAM_CHAT_ID");   // @YourChannel OR -100xxxxxxxxxx
const HOST_URL  = defineSecret("SITE_HOST_URL");      // e.g. https://sitagu-mm.web.app

initializeApp();
const db = getFirestore();

// Gmail သုံးမယ်ဆိုရင် App Password လိုပါမယ်
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "panna07@gmail.com",
    pass: "Buddha@588"
  }
});

export const emailOnEventCreated = onDocumentCreated("events/{eventId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const title = data.title || "Event";
  const date  = data.date  || "";
  const desc  = data.desc  || "";
  const link  = "https://sitagu-mm.web.app/#events"; // သင့် site link

  // Subscribers ယူမယ်
  const subsSnap = await db.collection("subscribers").get();
  const emails = subsSnap.docs.map(d => d.data().email).filter(Boolean);

  // Batch-push (ရိုးရိုး loop; scale ကြီးရင် chunking/queue)
  for (const to of emails) {
    await transporter.sendMail({
      from: `BuddhaCollege <YOUR_EMAIL@gmail.com>`,
      to,
      subject: `🎉 အခါကြီး/ရက်ကြီးအသစ် — ${title}`,
      html: `
        <h3>${title}</h3>
        <p><strong>ရက်စွဲ</strong>: ${date}</p>
        ${desc ? `<p>${desc}</p>` : ""}
        <p><a href="${link}">Website တွင် ကြည့်ရန်</a></p>
      `
    });
  }
});

export const shareToTelegram = onDocumentCreated(
  {
    document: "posts/{postId}",
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    retry: false,
    secrets: [BOT_TOKEN, CHAT_ID, HOST_URL],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const postId = event.params.postId;
    const title = data.title || "New Post";

    // Build post URL
    const baseUrl = HOST_URL.value();
    const url = `${baseUrl}${baseUrl.endsWith("/") ? "" : "/"}?post=${encodeURIComponent(postId)}`;

    // Make a small excerpt from first text block
    const firstText = Array.isArray(data.blocks) ? data.blocks.find(b => b?.type === "text") : null;
    const raw = firstText?.text || "";
    const excerpt = raw.replace(/<[^>]*>/g, "").slice(0, 140) + (raw.length > 140 ? "…" : "");

    const message = `📜 *${title}*\n${excerpt ? excerpt + "\n" : ""}${url}`;

    // Node 20+ has global fetch
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN.value()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID.value(), // @ChannelName OR -100...
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Telegram share failed:", res.status, body);
      return;
    }

    // Mark as shared (optional)
    await db.doc(`posts/${postId}`).set({
      shared: { telegram: true, at: Date.now() },
    }, { merge: true });
  }
);