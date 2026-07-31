import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "proofcheck",
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: process.env.NODE_ENV !== "production",
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
