// Generic pager for ISAPI search endpoints (UserInfo, CardInfo, AcsEvent, ...).
//
// Every search takes searchID + searchResultPosition + maxResults and answers
// with responseStatusStrg: "MORE" (more pages), "OK" (last page) or "NO MATCH".

import type { IsapiClient } from "./client.ts";

export type SearchSpec = {
  path: string; // e.g. "/ISAPI/AccessControl/UserInfo/Search"
  condKey: string; // e.g. "UserInfoSearchCond"
  resultKey: string; // e.g. "UserInfoSearch"
  listKey: string; // e.g. "UserInfo"
  cond?: Record<string, unknown>; // extra filter fields
  pageSize?: number; // the device may cap this; 30 is safe on most terminals
};

export async function* searchAll<T = any>(client: IsapiClient, spec: SearchSpec): AsyncGenerator<T> {
  const searchID = `s${Date.now().toString(36)}`; // same ID for every page
  const pageSize = spec.pageSize ?? 30;
  let position = 0;

  while (true) {
    const res = await client.json("POST", spec.path, {
      [spec.condKey]: {
        searchID,
        searchResultPosition: position,
        maxResults: pageSize,
        ...spec.cond,
      },
    });
    const page = res[spec.resultKey] ?? {};
    const raw = page[spec.listKey] ?? [];
    const items: T[] = Array.isArray(raw) ? raw : [raw];

    for (const item of items) yield item;

    // Stop on anything but MORE. Also stop if the device says MORE but sends
    // nothing, otherwise the same page would be requested forever.
    if (page.responseStatusStrg !== "MORE" || items.length === 0) return;
    position += items.length;
  }
}
