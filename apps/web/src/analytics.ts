import type { BeforeSendEvent } from "@vercel/analytics";

// Vercel Web Analytics `beforeSend`: every event's URL leaves without its query
// string (a link can carry ids or tokens there). The hash stays: the changelog
// anchors on /docs are page positions, not data.
export function stripQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url: URL = new URL(event.url);
  url.search = "";
  return { ...event, url: url.toString() };
}
