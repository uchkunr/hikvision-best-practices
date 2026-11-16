// Fetch access events (card swipes, face matches, door events) from the last 24 hours.
//
//   node --env-file=.env access-events.ts
//
// Set HIK_TZ_OFFSET to the device's UTC offset in minutes, e.g. 300 for UTC+5.

import { IsapiClient, isapiTime } from "./lib/client.ts";
import { searchAll } from "./lib/search.ts";

const client = IsapiClient.fromEnv();
const offset = Number(process.env.HIK_TZ_OFFSET ?? 0);
const now = new Date();

const events = searchAll(client, {
  path: "/ISAPI/AccessControl/AcsEvent",
  condKey: "AcsEventCond",
  resultKey: "AcsEvent",
  listKey: "InfoList",
  cond: {
    major: 5, // MAJOR_EVENT: access events
    minor: 0, // 0 = every minor type
    startTime: isapiTime(new Date(now.getTime() - 24 * 3600_000), offset),
    endTime: isapiTime(now, offset),
  },
});

for await (const e of events) {
  console.log(e.time, `minor=${e.minor}`, e.employeeNoString ?? "", e.name ?? "", e.cardNo ?? "");
}
