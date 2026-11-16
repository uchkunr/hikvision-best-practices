// Control a door remotely.
//
//   node --env-file=.env open-door.ts            # door 1, "open"
//   node --env-file=.env open-door.ts 1 resume   # back to the normal schedule
//
// Commands: open, close, alwaysOpen, alwaysClose, resume. Devices differ; check
// GET /ISAPI/AccessControl/RemoteControl/door/capabilities first.

import { IsapiClient } from "./lib/client.ts";

const [doorNo = "1", cmd = "open"] = process.argv.slice(2);
const client = IsapiClient.fromEnv();

// XML works on every firmware. The device can answer HTTP 200 with a failed
// ResponseStatus, so client.xml checks statusCode too.
await client.xml(
  "PUT",
  `/ISAPI/AccessControl/RemoteControl/door/${doorNo}`,
  `<RemoteControlDoor><cmd>${cmd}</cmd></RemoteControlDoor>`,
);
console.log(`Door ${doorNo}: ${cmd}`);
