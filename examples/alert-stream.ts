// Arming mode: keep a connection open and print events as the device sends them.
//
//   node --env-file=.env alert-stream.ts
//
// The device answers with multipart/mixed. Each part is XML or JSON (an
// EventNotificationAlert), or a JPEG that belongs to the previous event.
// Cameras send a "videoloss"/"inactive" heartbeat when idle; access terminals
// may stay quiet, so the idle timeout here is generous.

import { IsapiClient } from "./lib/client.ts";

const IDLE_MS = 120_000; // reconnect when nothing arrives for this long
const client = IsapiClient.fromEnv();

while (true) {
  try {
    await listen();
  } catch (err) {
    console.error(`Stream ended: ${(err as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 5_000));
}

async function listen(): Promise<void> {
  const abort = new AbortController();
  let idle = setTimeout(() => abort.abort(new Error("idle timeout")), IDLE_MS);

  const res = await client.fetch("/ISAPI/Event/notification/alertStream", { signal: abort.signal });
  const boundary = /boundary="?([^";]+)"?/i.exec(res.headers.get("content-type") ?? "")?.[1];
  if (!res.ok || !boundary || !res.body) {
    throw new Error(`Unexpected response ${res.status} ${res.headers.get("content-type")}`);
  }
  console.log(`Connected, boundary=${boundary}`);

  const delimiter = Buffer.from(`--${boundary}`);
  let buf = Buffer.alloc(0);

  for await (const chunk of res.body) {
    clearTimeout(idle);
    idle = setTimeout(() => abort.abort(new Error("idle timeout")), IDLE_MS);
    buf = Buffer.concat([buf, chunk]);

    // Consume every complete part in the buffer.
    while (true) {
      const start = buf.indexOf(delimiter);
      if (start === -1) break;
      const headerEnd = buf.indexOf("\r\n\r\n", start);
      if (headerEnd === -1) break;

      const headers = buf.subarray(start + delimiter.length, headerEnd).toString("latin1");
      const type = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim() ?? "";
      const length = Number(/content-length:\s*(\d+)/i.exec(headers)?.[1]);
      const bodyStart = headerEnd + 4;

      let bodyEnd: number;
      if (Number.isFinite(length)) {
        bodyEnd = bodyStart + length;
        if (buf.length < bodyEnd) break; // wait for the rest
      } else {
        bodyEnd = buf.indexOf(delimiter, bodyStart);
        if (bodyEnd === -1) break;
      }

      handle(type, buf.subarray(bodyStart, bodyEnd));
      buf = buf.subarray(bodyEnd);
    }
  }
}

function handle(type: string, body: Buffer): void {
  if (type.includes("json")) {
    const e = JSON.parse(body.toString("utf8"));
    const acs = e.AccessControllerEvent;
    console.log(
      e.dateTime,
      e.eventType,
      e.eventState ?? "",
      acs ? `major=${acs.majorEventType} minor=${acs.subEventType} ${acs.employeeNoString ?? ""} ${acs.name ?? ""}` : "",
    );
  } else if (type.includes("xml")) {
    const xml = body.toString("utf8");
    const tag = (name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? "";
    if (tag("eventType") === "videoloss" && tag("eventState") === "inactive") return; // heartbeat
    console.log(tag("dateTime"), tag("eventType"), tag("eventState"), tag("channelID"));
  } else if (type.startsWith("image/")) {
    console.log(`  picture, ${body.length} bytes`);
  }
}
