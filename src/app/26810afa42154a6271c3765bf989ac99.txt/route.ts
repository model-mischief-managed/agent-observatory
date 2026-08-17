// IndexNow key file — proves domain ownership to api.indexnow.org so we can
// push URLs into the Bing index (which AI answer engines ground on).
// force-dynamic: the force-static prerender of this dotted route 404'd in prod.
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("26810afa42154a6271c3765bf989ac99", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
