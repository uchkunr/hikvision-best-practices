// Save a JPEG snapshot from a camera channel.
//
//   node --env-file=.env snapshot.ts 101 out.jpg
//
// Streaming channel IDs are <camera><stream>: 101 = camera 1 main stream, 102 = sub stream.

import { writeFile } from "node:fs/promises";
import { IsapiClient } from "./lib/client.ts";

const [channel = "101", out = "snapshot.jpg"] = process.argv.slice(2);
const client = IsapiClient.fromEnv();

const res = await client.fetch(`/ISAPI/Streaming/channels/${channel}/picture`);
if (!res.ok || !res.headers.get("content-type")?.includes("image")) {
  throw new Error(`Snapshot failed: ${res.status} ${await res.text()}`);
}
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log(`Saved ${out}`);
