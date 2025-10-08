import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const CHAT_ID   = defineSecret("TELEGRAM_CHAT_ID");
const HOST_URL  = defineSecret("SITE_HOST_URL"); // e.g. https://sitagu-mm.web.app

initializeApp();
const db = getFirestore();

export const shareToTelegram = onDocumentCreated(
  {
    document: "posts/{postId}",
    region: "asia-southeast1",
    timeoutSeconds: 30,
    memory: "256MiB",
    retry: false,
    secrets: [BOT_TOKEN, CHAT_ID, HOST_URL]
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const postId = event.params.postId;
    const title = data.title || "New Post";

    // Build post URL
    const baseUrl = HOST_URL.value();
    const url = `${baseUrl}${baseUrl.endsWith("/") ? "" : "/"}?post=${encodeURIComponent(postId)}`;

    // Make a small excerpt from first text block (strip tags)
    const firstText = Array.isArray(data.blocks) ? data.blocks.find(b => b?.type === "text") : null;
    const raw = firstText?.text || "";
    const excerpt = raw.replace(/<[^>]*>/g, "").slice(0, 140) + (raw.length > 140 ? "…" : "");

    const message = `📜 *${title}*\n${excerpt ? excerpt + "\n" : ""}${url}`;

    // Telegram API call
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN.value()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID.value(),
        text: message,
        parse_mode: "Markdown"
      })
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Telegram share failed:", res.status, body);
      return;
    }

    // Mark as shared in Firestore (optional)
    await db.doc(`posts/${postId}`).set({
      shared: { telegram: true, at: Date.now() }
    }, { merge: true });
  }
);
