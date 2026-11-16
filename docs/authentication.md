# Authentication

## HTTP Digest

ISAPI uses HTTP Digest authentication (RFC 2617 / RFC 7616), normally with `qop="auth"` and MD5.

1. Send the request without credentials. The device answers `401` with a `WWW-Authenticate: Digest` header carrying `realm`, `nonce` and `qop`.
2. Compute the response:
   - `HA1 = MD5(username:realm:password)`
   - `HA2 = MD5(method:uri)`, where `uri` is the path plus query string exactly as sent
   - `response = MD5(HA1:nonce:nc:cnonce:qop:HA2)`
3. Send the request again with `Authorization: Digest username="...", realm="...", nonce="...", uri="...", qop=auth, nc=00000001, cnonce="...", response="..."`. Echo `opaque` and `algorithm` if the challenge had them.
4. Reuse the nonce for later requests and increase `nc` by one each time. When the device rejects it (a new `401`), take the new challenge and retry once.

Reusing the nonce halves the number of requests. Without it, every call costs a `401` round trip.

Rules that save debugging time:

- Hash the URI you actually send, including `?format=json`.
- The request body has to be sent twice on a fresh challenge, so it must be a buffer, string or `FormData`, not a one-shot stream.
- Read the `algorithm` parameter instead of hard-coding MD5. The guide documents MD5 and MD5-sess; the example client also handles SHA-256 (RFC 7616) in case a device offers it.
- Do not retry in a loop on `401`. Every failed attempt counts toward the login lock.

A complete client is in [`examples/lib/client.ts`](../examples/lib/client.ts).

## HTTP Basic

Basic auth (`Authorization: Basic base64(user:pass)`) is off by default on current firmware. It can be turned on in the web UI (System → Security → Authentication) but sends the password in clear text on every request. Prefer Digest.

## User levels

Devices have three account levels: **Administrator** (`admin`, full access), **Operator** and **Viewer**. Operators and viewers only reach the resources their permissions allow.

A valid account without permission for a resource also gets `401`, not `403`. If credentials work for `GET /ISAPI/System/deviceInfo` but fail elsewhere, it is a permission problem, not a wrong password.

## Login lock

After too many failed logins the device locks the account. The limit is set in `GET/PUT /ISAPI/Security/illegalLoginLock`: 3 to 20 attempts, 5 by default.

A failed or locked login answers `401` with a `userCheck` body:

```xml
<userCheck version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <statusValue>401</statusValue>
  <statusString>Unauthorized</statusString>
  <lockStatus>locked</lockStatus>
  <unlockTime>1795</unlockTime>
  <retryLoginTime>0</retryLoginTime>
</userCheck>
```

- `lockStatus`: `unlock` or `locked`
- `unlockTime`: seconds until the lock ends
- `retryLoginTime`: attempts left before the lock

When you see `locked`, stop and wait `unlockTime` seconds. Retrying only extends the lock. Surface it to the user as "locked", not as "wrong password".

`GET /ISAPI/Security/userCheck` is a cheap way to test credentials.

## HTTPS and self-signed certificates

Devices ship with a self-signed certificate. Do not turn off TLS checks for the whole process (`NODE_TLS_REJECT_UNAUTHORIZED=0`), because that also disables them for every other host your service calls.

Trust the device certificate only for device requests instead. Export it once, for example with `openssl s_client -connect 192.168.1.64:443 -showcerts`, then pass it to a dedicated agent:

```ts
import { Agent } from "undici"; // npm i undici
import { readFileSync } from "node:fs";
import { IsapiClient } from "./lib/client.ts";

const dispatcher = new Agent({
  connect: {
    ca: readFileSync("device-192.168.1.64.pem"),
    // The default certificate is usually issued to the IP or a generic name.
    checkServerIdentity: () => undefined,
  },
});

const client = new IsapiClient({ host: "https://192.168.1.64", username, password, dispatcher });
```

Better still, install a certificate from your own CA on the device (web UI, or `/ISAPI/Security/deviceCertificate` on firmware that has it) and validate it normally.

## Activation

A new or factory-reset device is "inactive" and refuses normal login until a strong admin password is set, through SADP, the web UI or the activation API. Activation is a one-time setup step and is not covered here.
