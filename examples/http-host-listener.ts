// Listening mode: the device POSTs each event to your server.
//
//   node --env-file=.env http-host-listener.ts             # just listen
//   node --env-file=.env http-host-listener.ts configure   # also point the device here
//
// LISTEN_IP must be this machine's address as the device sees it.
// LISTEN_PORT defaults to 8080.

import { createServer } from "node:http";
import { IsapiClient } from "./lib/client.ts";

const port = Number(process.env.LISTEN_PORT ?? 8080);
const path = "/hik/events";

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    // Answer quickly; the device retries or drops events if you are slow.
    res.writeHead(200).end();

    const body = Buffer.concat(chunks);
    const type = req.headers["content-type"] ?? "";
    const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
    const parts = boundary ? splitMultipart(body, boundary) : [{ type, body }];

    for (const part of parts) {
      if (part.type.includes("json") || part.body[0] === 0x7b) {
        const e = JSON.parse(part.body.toString("utf8"));
        console.log(e.dateTime, e.eventType, JSON.stringify(e.AccessControllerEvent ?? e.eventDescription ?? ""));
      } else if (part.type.includes("xml") || part.body.subarray(0, 5).toString() === "<?xml") {
        const xml = part.body.toString("utf8");
        const tag = (n: string) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml)?.[1] ?? "";
        console.log(tag("dateTime"), tag("eventType"), tag("eventState"));
      } else {
        console.log(`  ${part.type || "binary"} part, ${part.body.length} bytes`);
      }
    }
  });
});

server.listen(port, () => console.log(`Listening on :${port}${path}`));

if (process.argv[2] === "configure") {
  const ip = process.env.LISTEN_IP;
  if (!ip) throw new Error("Set LISTEN_IP to this machine's address");
  const client = IsapiClient.fromEnv();

  await client.xml(
    "PUT",
    "/ISAPI/Event/notification/httpHosts",
    `<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <HttpHostNotification>
    <id>1</id>
    <url>${path}</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>${ip}</ipAddress>
    <portNo>${port}</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>`,
  );
  // Ask the device to send a test message to the listener.
  await client.xml("POST", "/ISAPI/Event/notification/httpHosts/1/test");
  console.log("Device configured and test sent");
}

function splitMultipart(body: Buffer, boundary: string): { type: string; body: Buffer }[] {
  const parts: { type: string; body: Buffer }[] = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delimiter);
  while (pos !== -1) {
    const headerEnd = body.indexOf("\r\n\r\n", pos);
    const next = body.indexOf(delimiter, pos + delimiter.length);
    if (headerEnd === -1 || next === -1) break;
    const headers = body.subarray(pos + delimiter.length, headerEnd).toString("latin1");
    const type = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim() ?? "";
    let end = next;
    if (body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2; // trailing CRLF
    parts.push({ type, body: body.subarray(headerEnd + 4, end) });
    pos = next;
  }
  return parts;
}
