<p align="center">
  <a href="https://www.hikvision.com/" target="blank">
    <img src="logo.png" width="240" alt="Hikvision Logo" />
  </a>
</p>

<p align="center">A comprehensive, production-grade developer reference for integrating with Hikvision devices using the <b>ISAPI Protocol</b>.</p>

<p align="center">
  <a href="https://www.hikvision.com/"><img src="https://img.shields.io/badge/protocol-ISAPI-E60012?logo=hikvision" alt="ISAPI Protocol" /></a>
</p>

## Overview

**ISAPI** (Internet Server Application Programming Interface) is Hikvision's unified HTTP-based API. It replaces legacy proprietary SDKs and works consistently across IP cameras, NVRs, DVRs, access-control terminals, video intercoms, and thermal devices. Every request is routed through a single base URL - `http://{device}/ISAPI/...` - and payloads are formatted in JSON or XML (JSON is preferred when `?format=json` is appended to the URL).

There is no cloud control plane for ISAPI. Each device is addressed directly over its local network or VPN IP. Centralized management platforms (such as HikCentral) run as an orchestration layer on top of these devices and expose their own APIs.

---

## API Flavors

| Flavor                 | Scope                                   | Auth                      | Base URL                               | Notes                                |
| ---------------------- | --------------------------------------- | ------------------------- | -------------------------------------- | ------------------------------------ |
| **ISAPI (HTTP)**       | Per-device local control - full surface | Digest (default) or Basic | `http://{device}/ISAPI/...`            | Standard local integration           |
| **ISAPI (HTTPS)**      | Per-device control over TLS             | Digest or Basic           | `https://{device}/ISAPI/...`           | Requires handling self-signed certs  |
| **RTSP**               | Live video streams                      | URL-embedded credentials  | `rtsp://{user}:{pw}@{device}:554/...`  | Media stream only - no control plane |
| **ONVIF**              | Device discovery & PTZ                  | WS-Security               | `http://{device}/onvif/device_service` | Standardized vendor-agnostic subset  |
| **HikCentral OpenAPI** | Central platform - multi-device         | AppKey/AppSecret (HMAC)   | `https://{platform}/artemis/api/...`   | Requires HikCentral server install   |

> Prefer ISAPI for applications directly controlling devices on a private network. Use HikCentral OpenAPI when integrating with enterprise-managed environments.

---

## Core Concepts

- **Resource Paths**: Device configurations are organized in a path tree: `/ISAPI/System/...`, `/ISAPI/AccessControl/...`, `/ISAPI/Streaming/...`, `/ISAPI/Intelligent/...`, `/ISAPI/Event/...`.
- **Channels**: Media streams and PTZ channels are identified numerically (e.g., `101` = channel 1 main stream, `102` = channel 1 sub-stream).
- **Doors**: Access terminals control entry points via `doorNo` parameters (typically `1`).
- **Employee Numbers**: Users on access control terminals are identified by an `employeeNo` string (up to 32 characters). Treat this as the stable external ID from your CRM/ERP.
- **Formats**: Most endpoints support JSON when appending `?format=json` and sending the `Content-Type: application/json` header. Legacy endpoints fallback to XML.
- **Encoding**: Modern firmware uses UTF-8. Older models require GBK XML for non-ASCII characters.
- **Clock Sync**: Digest authentication and event payloads are highly sensitive to clock drift. Ensure NTP is configured; a drift greater than 5 minutes will reject Digest authentication headers.

---

## Authentication

### HTTP Digest (Default)

Hikvision devices negotiate HTTP Digest (RFC 2617, `qop=auth`, MD5) by default. The handshake flow operates as follows:

1. Issue an unauthenticated request - the device responds with a `401 Unauthorized` status and a `WWW-Authenticate` header containing `realm`, `nonce`, and `qop`.
2. Compute `HA1 = MD5(user:realm:pass)`, `HA2 = MD5(method:uri)`, and the final `response = MD5(HA1:nonce:nc:cnonce:qop:HA2)`.
3. Re-issue the request containing the computed `Authorization: Digest` header.
4. Keep the connection alive and increment the nonce count (`nc`) for subsequent requests.

#### TypeScript Node.js Digest Auth Implementation

```typescript
import crypto from "node:crypto";

class DigestAuth {
  private nc = 0;
  constructor(
    private user: string,
    private pass: string,
  ) {}

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const r1 = await fetch(url, init);
    if (r1.status !== 401) return r1;

    const www = r1.headers.get("www-authenticate") ?? "";
    await r1.text(); // Flush the socket
    const p: Record<string, string> = {};
    for (const m of www.matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]+))/g)) {
      p[m[1]] = m[2] ?? m[3];
    }

    this.nc++;
    const nc = this.nc.toString(16).padStart(8, "0");
    const cnonce = crypto.randomBytes(8).toString("hex");
    const u = new URL(url);
    const uri = u.pathname + u.search;
    const method = init.method ?? "GET";
    const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");

    const ha1 = md5(`${this.user}:${p.realm}:${this.pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const resp = md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${p.qop}:${ha2}`);
    const auth =
      `Digest username="${this.user}", realm="${p.realm}", nonce="${p.nonce}", ` +
      `uri="${uri}", response="${resp}", qop=${p.qop}, nc=${nc}, cnonce="${cnonce}"` +
      (p.opaque ? `, opaque="${p.opaque}"` : "");

    return fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: auth },
    });
  }
}
```

### HTTP Basic

Basic authentication (`Authorization: Basic base64(user:pass)`) is supported by older firmware but disabled by default on modern devices. It can be enabled under **System -> Security -> Authentication** in the device's web UI.

### HTTPS & Self-Signed Certificates

Since cameras use self-signed certificates, you must handle SSL trust issues. For internal server-to-device scripting, you can bypass certificate validation:

```typescript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
```

### Account Lockout Protection

Repeated failed authentication attempts lock the admin user for 30 minutes (typically after 5 failures). Locked responses return `401` with an XML payload containing `<lockStatus>locked</lockStatus>` and `<unlockTime>seconds</unlockTime>`. Parse this response to prevent request loops:

```typescript
if (r.status === 401 && body.includes("lockStatus")) {
  const until = body.match(/<unlockTime>(.*?)<\/unlockTime>/)?.[1];
  throw new Error(`Device locked, retry in ${until}s`);
}
```

---

## Quick Start

```typescript
const client = new DigestAuth("admin", "changeme123!");
const host = "http://192.168.1.9";

// Retrieve system device information
const r = await client.fetch(`${host}/ISAPI/System/deviceInfo?format=json`);
const data = await r.json();
console.log(data.DeviceInfo);
```

---

## Request & Response Format

State-changing requests (`POST`/`PUT`/`DELETE`) return the following success envelope:

```json
{ "statusCode": 1, "statusString": "OK", "subStatusCode": "ok" }
```

Validation errors or failures return a non-zero status:

```json
{
  "statusCode": 6,
  "statusString": "Invalid Operation",
  "subStatusCode": "deviceUserAlreadyExist",
  "errorCode": 983043,
  "errorMsg": "deviceUserAlreadyExist"
}
```

Always parse `subStatusCode` for programmatic handling (such as ignoring `deviceUserAlreadyExist` errors during upserts).

---

## System & Device Endpoints

| Operation        | Method  | Endpoint                             | Description                         |
| ---------------- | ------- | ------------------------------------ | ----------------------------------- |
| Device Info      | GET     | `/ISAPI/System/deviceInfo`           | Serial, model, firmware, MAC        |
| Capabilities     | GET     | `/ISAPI/System/capabilities`         | Device capabilities schema          |
| Reboot           | PUT     | `/ISAPI/System/reboot`               | Restarts the device                 |
| Factory Reset    | PUT     | `/ISAPI/System/factoryReset`         | Reset config (`?mode=full`/`basic`) |
| Time             | GET/PUT | `/ISAPI/System/time`                 | System clock, NTP configuration     |
| Network Settings | GET/PUT | `/ISAPI/System/Network/interfaces/1` | IP configurations                   |
| Admin Accounts   | GET     | `/ISAPI/Security/users`              | Local administrator users           |
| Log Search       | POST    | `/ISAPI/ContentMgmt/logSearch`       | Device audit logs                   |

---

## Access Control

Used on DS-K series access terminals, door controllers, and intercom units.

### Persons (UserInfo)

| Operation | Method | Endpoint                               | Description                  |
| --------- | ------ | -------------------------------------- | ---------------------------- |
| Count     | GET    | `/ISAPI/AccessControl/UserInfo/Count`  | Count total enrolled persons |
| Search    | POST   | `/ISAPI/AccessControl/UserInfo/Search` | Paginated search or filter   |
| Create    | POST   | `/ISAPI/AccessControl/UserInfo/Record` | Create a new user record     |
| Modify    | PUT    | `/ISAPI/AccessControl/UserInfo/Modify` | Update user parameters       |
| Replace   | PUT    | `/ISAPI/AccessControl/UserInfo/SetUp`  | Full record replace          |
| Delete    | PUT    | `/ISAPI/AccessControl/UserInfo/Delete` | Delete user by employeeNo    |

```typescript
// Create user record
await client.fetch(`${host}/ISAPI/AccessControl/UserInfo/Record?format=json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    UserInfo: {
      employeeNo: "1001",
      name: "Aliyev Jasur",
      userType: "normal",
      Valid: {
        enable: true,
        beginTime: "2026-01-01T00:00:00",
        endTime: "2030-12-31T23:59:59",
      },
      doorRight: "1",
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
    },
  }),
});
```

### Cards & Credentials

| Operation   | Method | Endpoint                               | Description                 |
| ----------- | ------ | -------------------------------------- | --------------------------- |
| Card Search | POST   | `/ISAPI/AccessControl/CardInfo/Search` | Query user card association |
| Card Assign | POST   | `/ISAPI/AccessControl/CardInfo/Record` | Register card identifier    |
| Card Delete | PUT    | `/ISAPI/AccessControl/CardInfo/Delete` | Remove card relationship    |

```json
{
  "CardInfo": {
    "employeeNo": "1001",
    "cardNo": "0012345678",
    "cardType": "normalCard"
  }
}
```

### Face Library (FDLib)

Enrolled face pictures are stored in face database index `1` (`faceLibType=blackFD`).

| Operation   | Method | Endpoint                                   | Description              |
| ----------- | ------ | ------------------------------------------ | ------------------------ |
| Upload Face | POST   | `/ISAPI/Intelligent/FDLib/FaceDataRecord`  | Multipart file upload    |
| Search Face | POST   | `/ISAPI/Intelligent/FDLib/FDSearch`        | Retrieve face parameters |
| Delete Face | PUT    | `/ISAPI/Intelligent/FDLib/FDSearch/Delete` | Remove face profile      |

#### Registering Face Images

Face upload requests use a `multipart/form-data` payload containing a JSON metadata part followed by raw JPEG bytes. The payload order is strict:

1. `FaceDataRecord`: JSON containing target metadata (`faceLibType`, `FDID`, `FPID`).
2. `FaceImage`: Raw JPEG file stream.

```typescript
const meta = JSON.stringify({
  faceLibType: "blackFD",
  FDID: "1",
  FPID: employeeNo,
});
const boundary = `----hik${Date.now().toString(16)}`;
const CRLF = "\r\n";

const head =
  `--${boundary}${CRLF}` +
  `Content-Disposition: form-data; name="FaceDataRecord";${CRLF}` +
  `Content-Type: application/json${CRLF}` +
  `Content-Length: ${meta.length}${CRLF}${CRLF}${meta}` +
  `${CRLF}--${boundary}${CRLF}` +
  `Content-Disposition: form-data; name="FaceImage";${CRLF}` +
  `Content-Type: image/jpeg${CRLF}` +
  `Content-Length: ${jpegBuf.length}${CRLF}${CRLF}`;
const tail = `${CRLF}--${boundary}--${CRLF}`;

const body = Buffer.concat([Buffer.from(head), jpegBuf, Buffer.from(tail)]);

await client.fetch(
  `${host}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`,
  {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  },
);
```

> **Constraints**: Images must be JPEG, size <= 200 KB, minimum resolution 80x80 px, containing a single frontal face.

### Access Control Events (AcsEvent)

AcsEvents are logs generated upon entry authentication (card swipes, face recognition, button presses).

```typescript
const body = {
  AcsEventCond: {
    searchID: `poll-${Date.now()}`,
    searchResultPosition: 0,
    maxResults: 100,
    major: 5, // Access Event Category
    minor: 75, // Face Authentication Success Code
    startTime: "2026-04-12T00:00:00",
    endTime: "2026-04-12T23:59:59",
  },
};
const res = await client.fetch(
  `${host}/ISAPI/AccessControl/AcsEvent?format=json`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  },
);
const data = await res.json();
```

### Remote Door Control

| Operation | Method | Endpoint                                           | Description         |
| --------- | ------ | -------------------------------------------------- | ------------------- |
| Command   | PUT    | `/ISAPI/AccessControl/RemoteControl/door/{doorNo}` | Open/Close commands |

```json
{ "RemoteControlDoor": { "cmd": "open" } }
```

Supported commands: `open`, `close`, `alwaysOpen`, `alwaysClose`, `resume`.

---

## Video & Imaging

### Streaming Channels

Channels are mapped using the format `{channel}{stream}` (e.g. `101` = camera 1 main stream, `102` = camera 1 sub-stream).

| Operation     | Method  | Endpoint                         | Description                         |
| ------------- | ------- | -------------------------------- | ----------------------------------- |
| List Channels | GET     | `/ISAPI/Streaming/channels`      | Retrieve available video channels   |
| Config        | GET/PUT | `/ISAPI/Streaming/channels/{id}` | Edit streaming codec configurations |

RTSP URL templates:

```text
rtsp://user:pass@192.168.1.64:554/Streaming/Channels/101
rtsp://user:pass@192.168.1.64:554/ISAPI/Streaming/channels/101/httpPreview
```

### Snapshots & PTZ

| Operation      | Method | Endpoint                                               | Description                      |
| -------------- | ------ | ------------------------------------------------------ | -------------------------------- |
| Snapshot       | GET    | `/ISAPI/Streaming/channels/{id}/picture`               | Retrieve single JPEG image frame |
| PTZ Continuous | PUT    | `/ISAPI/PTZCtrl/channels/{id}/continuous`              | Start pan/tilt movement          |
| PTZ Preset     | PUT    | `/ISAPI/PTZCtrl/channels/{id}/presets/{presetNo}/goto` | Move camera to preset            |

Continuous movement schema:

```json
{ "PTZData": { "pan": 60, "tilt": 0, "zoom": 0 } }
```

---

## Event Subscription (Real-time)

To receive device event streams with low latency, choose between listening or push notification modes.

### Alert Stream (Listening Mode)

Maintains a persistent HTTP connection where the device streams events using `multipart/mixed` blocks.

```text
GET /ISAPI/Event/notification/alertStream?format=json
Accept: multipart/mixed
```

Parse boundaries from the `Content-Type: multipart/mixed; boundary=...` header to unpack individual event payloads.

### HTTP Host Notification (Push Mode)

Configures the device to post event payloads to a specific application listener endpoint.

```text
PUT /ISAPI/Event/notification/httpHosts/1
```

```json
{
  "HttpHostNotification": {
    "id": "1",
    "url": "http://listener.internal/hik",
    "protocolType": "HTTP",
    "parameterFormatType": "JSON",
    "addressingFormatType": "ipaddress",
    "ipAddress": "10.0.0.5",
    "portNo": 8080,
    "httpAuthenticationMethod": "none"
  }
}
```

---

## Event Categories & Codes

Events are grouped into major types:

| Major (Dec) | Name              | Description                                      |
| ----------- | ----------------- | ------------------------------------------------ |
| 1           | `MAJOR_ALARM`     | Motion detection, tampering, smart line crossing |
| 2           | `MAJOR_EXCEPTION` | Hardware errors, IP conflicts, storage issues    |
| 3           | `MAJOR_OPERATION` | Admin credentials logging, system reboots        |
| 5           | `MAJOR_EVENT`     | Access control passes, face verification events  |

Relevant minor codes under `MAJOR_EVENT` (5):

| Minor | Meaning                            | Description                     |
| ----- | ---------------------------------- | ------------------------------- |
| 38    | Card authentication success        | Valid physical card scan        |
| 75    | Face authentication success        | Face recognition pass           |
| 76    | Face authentication fail           | Verification mismatch           |
| 113   | Fingerprint authentication success | Valid fingerprint scan          |
| 27    | Exit button pressed                | Physical exit button activation |

---

## Pagination & Search Pattern

All search operations follow a unified pagination structure:

- `searchID`: Cursor string identifier. Must remain identical throughout all subsequent page requests.
- `searchResultPosition`: Result offset. Must be incremented by the `numOfMatches` value returned in the prior response.
- `maxResults`: Page size limit (e.g. 100).
- `responseStatusStrg`: Status token (`"OK"` on the final page, `"MORE"` if more records are available, `"NO_MATCHES"` if no records were found).

```typescript
async function* iterPersons(client: DigestAuth, host: string) {
  const searchID = `sync-${Date.now()}`;
  let pos = 0;
  while (true) {
    const r = await client.fetch(
      `${host}/ISAPI/AccessControl/UserInfo/Search?format=json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          UserInfoSearchCond: {
            searchID,
            searchResultPosition: pos,
            maxResults: 100,
          },
        }),
      },
    );
    const { UserInfoSearch } = await r.json();
    for (const u of UserInfoSearch?.UserInfo ?? []) yield u;
    const got = UserInfoSearch?.numOfMatches ?? 0;
    if (!got || UserInfoSearch.responseStatusStrg === "OK") break;
    pos += got;
  }
}
```
