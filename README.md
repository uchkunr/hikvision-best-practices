<h1 id="hikvision-isapi">
Hikvision ISAPI - Comprehensive Guide
</h1>

A comprehensive, practical reference for developers integrating with Hikvision devices — cameras, NVR/DVRs, and access-control face terminals — via **ISAPI** (the HTTP API Hikvision exposes on every modern device). Examples are in TypeScript/Node.js using native `fetch` + custom HTTP **Digest** auth, taken from a real access-control integration that manages users, faces, doors, and attendance events across a fleet of DS-K1T series terminals.

## Table of Contents

- [Overview](#overview)
- [API Flavors](#api-flavors)
- [Core Concepts](#core-concepts)
- [Authentication](#authentication)
  - [HTTP Digest (default)](#http-digest-default)
  - [HTTP Basic](#http-basic)
  - [HTTPS & Self-Signed Certificates](#https--self-signed-certificates)
  - [Account Lockout](#account-lockout)
- [Quick Start](#quick-start)
- [Request & Response Format](#request--response-format)
- [System & Device](#system--device)
- [Access Control](#access-control)
  - [Persons (UserInfo)](#persons-userinfo)
  - [Cards](#cards)
  - [Fingerprints](#fingerprints)
  - [Face Library (FDLib)](#face-library-fdlib)
  - [Access Events (AcsEvent)](#access-events-acsevent)
  - [Remote Door Control](#remote-door-control)
  - [Schedule & Holiday Plans](#schedule--holiday-plans)
- [Video & Imaging](#video--imaging)
  - [Streaming Channels](#streaming-channels)
  - [Snapshots](#snapshots)
  - [PTZ Control](#ptz-control)
  - [Playback & Recording](#playback--recording)
- [Smart / Intelligent Features](#smart--intelligent-features)
- [Event Subscription (Real-time)](#event-subscription-real-time)
  - [Alert Stream (Listening Mode)](#alert-stream-listening-mode)
  - [HTTP Host Notification (Push Mode)](#http-host-notification-push-mode)
  - [Event Major/Minor Codes](#event-majorminor-codes)
- [Common Error Codes](#common-error-codes)
- [Pagination & Search](#pagination--search)
- [Community SDKs & Tools](#community-sdks--tools)
- [Real-World Integration Notes](#real-world-integration-notes)

## Overview

**ISAPI** (Internet Server Application Programming Interface) is Hikvision's unified HTTP-based API. It replaces the older PSIA/SDK-only access and works consistently across IP cameras, NVRs, DVRs, access-control terminals, video intercoms, and thermal devices. Every request goes through a single base URL — `http://{device}/ISAPI/...` — and bodies are JSON or XML depending on the endpoint (JSON is preferred when `?format=json` is supported).

There is **no cloud control plane** for ISAPI. Each device is addressed directly over its LAN/VPN IP. Hikvision's cloud product (**Hik-Connect** / **HikCentral**) sits *on top of* devices and has its own OpenAPI surface — see the last section.

## API Flavors

| Flavor | Scope | Auth | Base URL | Notes |
| --- | --- | --- | --- | --- |
| **ISAPI (HTTP)** | Per-device local control — full surface | Digest (default) or Basic | `http://{device}/ISAPI/...` | This guide |
| **ISAPI (HTTPS)** | Same, but TLS | Digest / Basic | `https://{device}/ISAPI/...` | Often self-signed cert |
| **RTSP** | Live video streams | URL-embedded credentials | `rtsp://{user}:{pw}@{device}:554/...` | Stream only — no control |
| **ONVIF** | Camera discovery & PTZ | WS-Security | `http://{device}/onvif/device_service` | Vendor-agnostic subset |
| **HikCentral OpenAPI** | Cloud/central platform — multi-device | AppKey/AppSecret (HMAC) | `https://{platform}/artemis/api/...` | Requires HCP install |

> Prefer ISAPI for integrations that own the devices. Use HikCentral OpenAPI when working inside an existing enterprise deployment.

## Core Concepts

- **Resource paths** mirror a device tree: `/ISAPI/System/...`, `/ISAPI/AccessControl/...`, `/ISAPI/Streaming/...`, `/ISAPI/Intelligent/...`, `/ISAPI/Event/...`.
- **Channels**: cameras/NVRs address streams and PTZ by a numeric channel id (`101` = channel 1 main stream, `102` = channel 1 sub-stream).
- **Doors**: access terminals address doors by `doorNo` (usually `1`).
- **Employee numbers**: persons on an access terminal are keyed by `employeeNo` (string, up to 32 chars). Treat this as the stable external ID — your CRM/ERP row id works well.
- **Formats**: Most endpoints accept both XML and JSON. Append `?format=json` on the URL *and* send `Content-Type: application/json`. Some legacy endpoints are XML-only.
- **Encoding**: Newer firmware requires UTF-8 JSON. Older firmware needs GBK XML for non-ASCII names — if a Russian/Chinese/Uzbek name comes back as `???`, you hit this.
- **Clock drift**: Digest nonces and event timestamps are anchored to device time. Keep the device on NTP — skew > 5 minutes breaks Digest on some firmware.

## Authentication

### HTTP Digest (default)

Every modern Hikvision device negotiates **HTTP Digest** (RFC 2617, `qop=auth`, MD5). The flow:

1. Send the request unauthenticated — device replies `401 Unauthorized` with `WWW-Authenticate: Digest realm="...", nonce="...", qop="auth", ...`.
2. Compute `HA1 = MD5(user:realm:pass)`, `HA2 = MD5(method:uri)`, `response = MD5(HA1:nonce:nc:cnonce:qop:HA2)`.
3. Retry with `Authorization: Digest username="...", realm="...", nonce="...", uri="...", response="...", qop=auth, nc=00000001, cnonce="..."`.
4. Reuse the nonce and increment `nc` for subsequent requests until the device issues a fresh `WWW-Authenticate`.

In Node.js with native `fetch` (no axios, no external auth lib):

```ts
import crypto from "node:crypto";

class DigestAuth {
  private nc = 0;
  constructor(private user: string, private pass: string) {}

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const r1 = await fetch(url, init);
    if (r1.status !== 401) return r1;

    const www = r1.headers.get("www-authenticate") ?? "";
    await r1.text(); // free the socket
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

    return fetch(url, { ...init, headers: { ...init.headers, Authorization: auth } });
  }
}
```

### HTTP Basic

Older firmware and some camera endpoints accept `Authorization: Basic base64(user:pass)`. Disabled by default on newer terminals — enable it in the device web UI under **System → Security → Authentication** if you need it. Prefer Digest for production.

### HTTPS & Self-Signed Certificates

Devices ship with self-signed certificates. Either install the device cert into your trust store or, for internal tooling, bypass verification:

```ts
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Node global
// or per-agent with undici/https.Agent if you need scoped bypass
```

### Account Lockout

Failed auth attempts lock the admin account — typically **5 wrong passwords → 30 minute lock**. A locked device returns `401` with an XML body containing `<lockStatus>locked</lockStatus>` and `<unlockTime>NNN</unlockTime>` (seconds). Parse and surface this to your operators; don't retry blindly:

```ts
if (r.status === 401 && body.includes("lockStatus")) {
  const until = body.match(/<unlockTime>(.*?)<\/unlockTime>/)?.[1];
  throw new Error(`Device locked, retry in ${until}s`);
}
```

## Quick Start

```ts
const client = new DigestAuth("admin", "changeme123!");
const host = "http://192.168.1.9";

// Device info
const r = await client.fetch(`${host}/ISAPI/System/deviceInfo?format=json`);
console.log(await r.json());
// { DeviceInfo: { deviceName, model, serialNumber, firmwareVersion, macAddress, ... } }
```

## Request & Response Format

Successful state-changing calls return:

```json
{ "statusCode": 1, "statusString": "OK", "subStatusCode": "ok" }
```

Errors return the same envelope with `statusCode !== 1`:

```json
{
  "statusCode": 6,
  "statusString": "Invalid Operation",
  "subStatusCode": "deviceUserAlreadyExist",
  "errorCode": 983043,
  "errorMsg": "deviceUserAlreadyExist"
}
```

The `subStatusCode` is the most useful field — `statusString` is often generic ("Invalid Operation", "Device Error"). Match on `subStatusCode` for idempotent retries (e.g. ignore `deviceUserAlreadyExist` when upserting).

XML responses wrap the same fields in `<ResponseStatus>`. The helper below works for both:

```ts
async function parseStatus(r: Response) {
  const text = await r.text();
  try { return JSON.parse(text); }
  catch {
    const get = (t: string) => text.match(new RegExp(`<${t}>(.*?)</${t}>`))?.[1];
    return { statusCode: Number(get("statusCode")), subStatusCode: get("subStatusCode") };
  }
}
```

## System & Device

| Operation         | Method | Endpoint                         | Description                     |
| ----------------- | ------ | -------------------------------- | ------------------------------- |
| Device Info       | GET    | `/ISAPI/System/deviceInfo`       | Model, serial, firmware, MAC    |
| Capabilities      | GET    | `/ISAPI/System/capabilities`     | Supported features tree         |
| Reboot            | PUT    | `/ISAPI/System/reboot`           | Restart device                  |
| Factory Reset     | PUT    | `/ISAPI/System/factoryReset`     | `?mode=full` or `?mode=basic`   |
| Time              | GET/PUT| `/ISAPI/System/time`             | Time mode, NTP server           |
| NTP Servers       | GET/PUT| `/ISAPI/System/time/ntpServers`  | NTP list                        |
| Network Interface | GET/PUT| `/ISAPI/System/Network/interfaces/1` | IPv4/IPv6/MAC             |
| Users (admin)     | GET    | `/ISAPI/Security/users`          | Device admin accounts           |
| Logs              | POST   | `/ISAPI/ContentMgmt/logSearch`   | System log query                |

```ts
// Reboot
await client.fetch(`${host}/ISAPI/System/reboot?format=json`, { method: "PUT" });
```

## Access Control

Applies to DS-K1T, DS-K5, MinMoe face terminals, and KV series intercoms. The per-device data model:

- **Person (UserInfo)** keyed by `employeeNo` → name, valid period, user type, door rights.
- **Credentials** attached to a person: cards, fingerprints, face pictures.
- **Door** addressed by `doorNo`. Access terminals usually expose `1`.
- **RightPlan** binds `doorNo` ↔ `planTemplateNo` (schedule). Template `1` = 24/7.

### Persons (UserInfo)

| Operation     | Method | Endpoint                                       | Description                      |
| ------------- | ------ | ---------------------------------------------- | -------------------------------- |
| Count         | GET    | `/ISAPI/AccessControl/UserInfo/Count`          | `userNumber` — total persons     |
| Search        | POST   | `/ISAPI/AccessControl/UserInfo/Search`         | Paginated list / by employeeNo   |
| Create        | POST   | `/ISAPI/AccessControl/UserInfo/Record`         | Add person                       |
| Modify        | PUT    | `/ISAPI/AccessControl/UserInfo/Modify`         | Partial update                   |
| SetUp         | PUT    | `/ISAPI/AccessControl/UserInfo/SetUp`          | Full replace (overwrite record)  |
| Delete        | PUT    | `/ISAPI/AccessControl/UserInfo/Delete`         | Remove by employeeNo             |
| Capabilities  | GET    | `/ISAPI/AccessControl/UserInfo/capabilities`   | Field limits, max count          |

```ts
// Create person
await client.fetch(`${host}/ISAPI/AccessControl/UserInfo/Record?format=json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    UserInfo: {
      employeeNo: "1001",
      name: "Aliyev Jasur",
      userType: "normal",                 // normal | visitor | blackList | maintenance
      Valid: {
        enable: true,
        beginTime: "2024-01-01T00:00:00",
        endTime:   "2030-12-31T23:59:59",
      },
      doorRight: "1",
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
    },
  }),
});
```

```ts
// Paginated search
await client.fetch(`${host}/ISAPI/AccessControl/UserInfo/Search?format=json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    UserInfoSearchCond: {
      searchID: "erp-1",                  // any string; MUST be stable across pages
      searchResultPosition: 0,
      maxResults: 100,
      // EmployeeNoList: [{ employeeNo: "1001" }],  // optional filter
    },
  }),
});
```

> **Gotcha:** paginate with `searchResultPosition += numOfMatches` using the **same** `searchID`. Changing `searchID` resets server-side cursor state.

### Cards

| Operation | Method | Endpoint                                      |
| --------- | ------ | --------------------------------------------- |
| Search    | POST   | `/ISAPI/AccessControl/CardInfo/Search`        |
| Create    | POST   | `/ISAPI/AccessControl/CardInfo/Record`        |
| Modify    | PUT    | `/ISAPI/AccessControl/CardInfo/Modify`        |
| Delete    | PUT    | `/ISAPI/AccessControl/CardInfo/Delete`        |

```json
{ "CardInfo": { "employeeNo": "1001", "cardNo": "0012345678", "cardType": "normalCard" } }
```

### Fingerprints

| Operation | Method | Endpoint                                               |
| --------- | ------ | ------------------------------------------------------ |
| Search    | POST   | `/ISAPI/AccessControl/CaptureFingerPrint`              |
| Set       | POST   | `/ISAPI/AccessControl/FingerPrintDownload`             |
| Delete    | PUT    | `/ISAPI/AccessControl/FingerPrint/Delete`              |

### Face Library (FDLib)

The face library is shared between access terminals and smart cameras. `FDID=1` is the built-in access library; `faceLibType=blackFD` is the name used by access terminals (misleading — it's the regular user library, not a blacklist).

| Operation      | Method | Endpoint                                                    | Description                   |
| -------------- | ------ | ----------------------------------------------------------- | ----------------------------- |
| Upload Face    | POST   | `/ISAPI/Intelligent/FDLib/FaceDataRecord`                   | multipart/form-data           |
| Search Face    | POST   | `/ISAPI/Intelligent/FDLib/FDSearch`                         | Find face by FPID             |
| Delete Face    | PUT    | `/ISAPI/Intelligent/FDLib/FDSearch/Delete`                  | `?FDID=1&faceLibType=blackFD` |
| Modify Face    | PUT    | `/ISAPI/Intelligent/FDLib/FDSetUp/Modify`                   | Re-bind / re-enroll           |
| List Libraries | GET    | `/ISAPI/Intelligent/FDLib`                                  | Named face libraries          |

Upload body is `multipart/form-data` with two named parts — `FaceDataRecord` (JSON metadata) and `FaceImage` (JPEG bytes). Hikvision is strict: the parts **must be in this order**, `Content-Length` on each part must be present, and the boundary must not appear inside the JSON.

```ts
const meta = JSON.stringify({ faceLibType: "blackFD", FDID: "1", FPID: employeeNo });
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

await client.fetch(`${host}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`, {
  method: "POST",
  headers: {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": String(body.length),
  },
  body,
});
```

> **Image constraints (from the ISAPI Developer Guide):** JPEG, ≥ 80×80 px, **≤ 200 KB**, single frontal face, no heavy rotation. The device returns `subStatusCode: "lowScoreFacePic"` or `"noFacePic"` if your image is unusable — re-crop and retry rather than treating as permanent failure.

> `FaceDataRecord` also accepts a **picture URL** instead of binary bytes — put `faceURL` inside the JSON part and omit the `FaceImage` part. Useful when the device can reach your image CDN directly.

### Access Events (AcsEvent)

The primary attendance feed. Query by time window and event code.

```ts
const body = {
  AcsEventCond: {
    searchID: `poll-${Date.now()}`,
    searchResultPosition: 0,
    maxResults: 100,
    major: 5,    // "Access Event" category
    minor: 75,   // "Auth passed by face" — see table below
    startTime: "2026-04-12T00:00:00",
    endTime:   "2026-04-12T23:59:59",
  },
};
await client.fetch(`${host}/ISAPI/AccessControl/AcsEvent?format=json`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
```

Response:

```json
{
  "AcsEvent": {
    "searchID": "poll-1712...",
    "totalMatches": 124,
    "numOfMatches": 100,
    "responseStatusStrg": "MORE",
    "InfoList": [
      {
        "time": "2026-04-12T08:14:22+05:00",
        "employeeNoString": "1001",
        "name": "Aliyev Jasur",
        "currentVerifyMode": "faceOrFpOrCardOrPw",
        "attendanceStatus": "checkIn",
        "major": 5, "minor": 75,
        "pictureURL": "http://192.168.1.9/.../capture/...jpg@user:pass"
      }
    ]
  }
}
```

Download the snapshot by stripping the `@user:pass` suffix and fetching with Digest:

```ts
const clean = pictureURL.split("@")[0];
const img = await client.fetch(clean);
```

`responseStatusStrg: "MORE"` means page again with `searchResultPosition += numOfMatches`.

### Remote Door Control

| Operation     | Method | Endpoint                                             |
| ------------- | ------ | ---------------------------------------------------- |
| Open / Close  | PUT    | `/ISAPI/AccessControl/RemoteControl/door/{doorNo}`   |
| Alarm Out     | PUT    | `/ISAPI/AccessControl/RemoteControl/alarmOut/{id}`   |

```json
{ "RemoteControlDoor": { "cmd": "open" } }
```

Valid `cmd`: `open`, `close`, `alwaysOpen`, `alwaysClose`, `resume`.

### Schedule & Holiday Plans

| Resource              | Endpoint                                              |
| --------------------- | ----------------------------------------------------- |
| Week Plan             | `/ISAPI/AccessControl/UserRightWeekPlanCfg/{planNo}`  |
| Holiday Plan          | `/ISAPI/AccessControl/UserRightHolidayPlanCfg/{no}`   |
| Holiday Group         | `/ISAPI/AccessControl/UserRightHolidayGroupCfg/{no}`  |
| Plan Template         | `/ISAPI/AccessControl/UserRightPlanTemplate/{no}`     |

Template `1` is the default 24/7 plan. Reference it from `RightPlan[].planTemplateNo`.

## Video & Imaging

### Streaming Channels

| Operation            | Method | Endpoint                                                |
| -------------------- | ------ | ------------------------------------------------------- |
| List channels        | GET    | `/ISAPI/Streaming/channels`                             |
| Channel config       | GET/PUT| `/ISAPI/Streaming/channels/{id}`                        |
| Channel capabilities | GET    | `/ISAPI/Streaming/channels/{id}/capabilities`           |

Channel IDs follow the pattern `{channel}{stream}`: `101` = cam 1 main, `102` = cam 1 sub, `201` = cam 2 main, etc.

RTSP (not ISAPI, but bundled with the device):

```
rtsp://user:pass@192.168.1.64:554/Streaming/Channels/101
rtsp://user:pass@192.168.1.64:554/ISAPI/Streaming/channels/101/httpPreview
```

### Snapshots

| Operation  | Method | Endpoint                                                 |
| ---------- | ------ | -------------------------------------------------------- |
| Snapshot   | GET    | `/ISAPI/Streaming/channels/{id}/picture`                 |

Returns a JPEG. Add `?videoResolutionWidth=1920&videoResolutionHeight=1080` to override.

### PTZ Control

| Operation         | Method | Endpoint                                                        |
| ----------------- | ------ | --------------------------------------------------------------- |
| Continuous move   | PUT    | `/ISAPI/PTZCtrl/channels/{id}/continuous`                       |
| Absolute position | PUT    | `/ISAPI/PTZCtrl/channels/{id}/absolute`                         |
| Relative position | PUT    | `/ISAPI/PTZCtrl/channels/{id}/relative`                         |
| Preset            | PUT    | `/ISAPI/PTZCtrl/channels/{id}/presets/{presetNo}/goto`          |
| Patrol            | PUT    | `/ISAPI/PTZCtrl/channels/{id}/patrols/{patrolNo}`               |

```json
{ "PTZData": { "pan": 60, "tilt": 0, "zoom": 0 } }
```

Values range `-100..100` for continuous motion.

### Playback & Recording

| Operation          | Method | Endpoint                                    |
| ------------------ | ------ | ------------------------------------------- |
| Search recordings  | POST   | `/ISAPI/ContentMgmt/search`                 |
| Download file      | GET    | `/ISAPI/ContentMgmt/download`               |
| Recording status   | GET    | `/ISAPI/ContentMgmt/record/tracks`          |

Playback uses RTSP with a time window:

```
rtsp://user:pass@192.168.1.64:554/Streaming/tracks/101?starttime=20260412T080000Z&endtime=20260412T090000Z
```

## Smart / Intelligent Features

| Resource             | Endpoint                                                        |
| -------------------- | --------------------------------------------------------------- |
| Line Crossing        | `/ISAPI/Smart/LineDetection/{ch}`                               |
| Intrusion Detection  | `/ISAPI/Smart/FieldDetection/{ch}`                              |
| Region Entry/Exit    | `/ISAPI/Smart/regionEntrance/{ch}`, `/regionExiting/{ch}`       |
| Face Capture         | `/ISAPI/Smart/FaceCapture/{ch}`                                 |
| People Counting      | `/ISAPI/Smart/channels/{ch}/counting`                           |
| Vehicle Detection    | `/ISAPI/Traffic/channels/{ch}/vehicleDetect`                    |
| Thermal              | `/ISAPI/Thermal/channels/{ch}/...`                              |

## Event Subscription (Real-time)

Polling `AcsEvent` every few seconds works for small fleets (it's what the sample integration does). For lower latency, use one of the push modes.

### Alert Stream (Listening Mode)

Open a long-lived HTTP GET and the device streams a `multipart/mixed` body — one part per event.

```
GET /ISAPI/Event/notification/alertStream
Accept: multipart/mixed
```

Each boundary part is an XML (or JSON with `?format=json`) `<EventNotificationAlert>` / `<AccessControllerEvent>` document. Parse the boundary from the initial `Content-Type: multipart/mixed; boundary=...` header, buffer bytes until the next boundary, then parse.

### HTTP Host Notification (Push Mode)

Configure the device to POST events **to you**:

```
PUT /ISAPI/Event/notification/httpHosts/{id}
```

```json
{
  "HttpHostNotification": {
    "id": "1", "url": "http://listener.internal/hik",
    "protocolType": "HTTP", "parameterFormatType": "JSON",
    "addressingFormatType": "ipaddress",
    "ipAddress": "10.0.0.5", "portNo": 8080,
    "httpAuthenticationMethod": "none"
  }
}
```

Your endpoint will receive `POST` bodies that look like the alertStream entries. Respond with `200 OK` quickly — devices will retry on timeout and log failures.

### Event Major/Minor Codes

Hikvision groups events into four major categories:

| major (hex) | dec | name              | what goes here                                           |
| ----------- | --- | ----------------- | -------------------------------------------------------- |
| `0x1`       | 1   | `MAJOR_ALARM`     | motion, tampering, line-cross, intrusion                 |
| `0x2`       | 2   | `MAJOR_EXCEPTION` | IP conflict, disk full, network unreachable              |
| `0x3`       | 3   | `MAJOR_OPERATION` | admin login, config changes, remote unlock               |
| `0x5`       | 5   | `MAJOR_EVENT`     | **access control, face recognition, attendance**         |

Access-control work lives almost entirely under `major=5`. The minors you will care about on face terminals:

| minor | meaning                         |
| ----- | ------------------------------- |
| `38`  | Card auth passed                |
| `75`  | **Face auth passed**            |
| `76`  | Face auth failed                |
| `113` | Fingerprint auth passed         |
| `27`  | Door open button pressed        |

The `cardType` field on an AcsEvent info object is also meaningful: `"5"` = **duress card** (forced-entry signal — surface this immediately in your UI). Other values: `1` normal, `2` disabled, `3` blacklist, `4` patrol, `6` super, `7` visitor, `8` dismiss.

The exact catalogue varies by firmware and model. Query `/ISAPI/AccessControl/AcsEvent/capabilities?format=json` for the live list rather than hardcoding a full enum.

## Common Error Codes

| `subStatusCode`               | HTTP | Meaning                                              |
| ----------------------------- | ---- | ---------------------------------------------------- |
| `ok`                          | 200  | Success                                              |
| `deviceUserAlreadyExist`      | 200  | Person with same `employeeNo` — upsert instead       |
| `deviceUserNotExist`          | 200  | Person not found on device                           |
| `employeeNoAlreadyExist`      | 200  | Same as above for some firmware                      |
| `lowScoreFacePic`             | 200  | Face image too low quality                           |
| `noFacePic`                   | 200  | No face detected in image                            |
| `faceDuplicate`               | 200  | Same face already enrolled under another person      |
| `reachMaxUser`                | 200  | Device person capacity reached                       |
| `riskPassword`                | 200  | Weak password rejected                               |
| `notActivated`                | 200  | Device not activated — set admin password first      |
| `deviceLocked`                | 401  | Too many bad auths — wait `unlockTime` seconds       |
| `userPasswordError`           | 401  | Wrong credentials                                    |
| `invalidOperation`            | 403  | Auth OK but endpoint unsupported on this firmware    |

A `200 OK` with `statusCode !== 1` is still a failure — always check the body.

## Pagination & Search

Search endpoints (`UserInfo/Search`, `CardInfo/Search`, `AcsEvent`, `FDSearch`, etc.) share one pattern:

- `searchID` — caller-generated cursor key. Keep it stable across pages.
- `searchResultPosition` — offset. Increment by `numOfMatches` from the prior response.
- `maxResults` — page size (commonly capped at 30 for AcsEvent, 100 elsewhere).
- `responseStatusStrg` — `"OK"` when last page, `"MORE"` when more pages remain, `"NO_MATCHES"` when empty.

```ts
async function* iterPersons(client: DigestAuth, host: string) {
  const searchID = `sync-${Date.now()}`;
  let pos = 0;
  while (true) {
    const r = await client.fetch(`${host}/ISAPI/AccessControl/UserInfo/Search?format=json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UserInfoSearchCond: { searchID, searchResultPosition: pos, maxResults: 100 },
      }),
    });
    const { UserInfoSearch } = await r.json();
    for (const u of UserInfoSearch?.UserInfo ?? []) yield u;
    const got = UserInfoSearch?.numOfMatches ?? 0;
    if (!got || UserInfoSearch.responseStatusStrg === "OK") break;
    pos += got;
  }
}
```

## Community SDKs & Tools

- [nayrnet/node-hikvision-api](https://github.com/nayrnet/node-hikvision-api) — Node.js ISAPI helper
- [Shaykhnazar/hikvision-isapi](https://github.com/Shaykhnazar/hikvision-isapi) — Laravel package for face recognition terminals
- [openlab-red/hikvision-isapi-cli](https://github.com/openlab-red/hikvision-isapi-cli) — generated OpenAPI + CLI
- [MissiaL/hikvision-client](https://github.com/MissiaL/hikvision-client) — async Python client
- [mezz64/pyHik](https://github.com/mezz64/pyHik) — alertStream listener (used by Home Assistant)
- [hikvision (crates.io)](https://crates.io/crates/hikvision) — Rust SDK
- Hikvision official **ISAPI Specification** PDFs (per product line: IPC, NVR, Access Control, Intercom). Request from your Hikvision distributor — they are not public but are the only complete reference.

## Real-World Integration Notes

A production ERP integration (attendance + face enrollment over a fleet of DS-K1T terminals) settled on these conventions:

- **Upsert, don't create**. Treat `deviceUserAlreadyExist` as success and follow up with `UserInfo/Modify` to update the name. Your ERP is the source of truth; the device is a cache.
- **Always delete the face before uploading a new one.** `FaceDataRecord` on an existing FPID returns success on some firmware and silently keeps the old face on others. Explicit `FDSearch/Delete` → `FaceDataRecord` is idempotent.
- **Fan out to all active terminals per write**, in a loop. Don't parallelize across one device — the ISAPI stack is single-threaded per session and will return `deviceBusy` under concurrent writes.
- **Poll AcsEvent on a 30–60 s interval per device**, paginating until `responseStatusStrg !== "MORE"`. Store raw events with `(deviceId, serialNo)` as dedupe key before deriving attendance; reprocessing after an ERP schema change is trivial that way.
- **Map `employeeNoString` from the event → user via `externalId` column.** The same `externalId` is what you passed as `employeeNo` when enrolling. Keep it numeric-string to avoid encoding issues on older firmware.
- **Account lockout is the #1 cause of "everything broke on Monday".** Wrong-password loops from a stuck sync worker will lock admin for 30 minutes. Parse `<lockStatus>` and back off instead of retrying.
- **Don't trust `statusString`.** Use `subStatusCode` for decisions and store both in your logs. Error messages drift between firmware releases; subStatusCode is more stable.

---

**References:**
[Hikvision TPP — ISAPI Developer Wiki](https://tpp.hikvision.com/Wiki/ISAPI/) ·
[ISAPI & OTAP Developer Guide (download)](https://tpp.hikvision.com/download/ISAPI_OTAP) ·
[AcsEvent endpoint](https://tpp.hikvision.com/Wiki/ISAPI/Access%20Control%20on%20Person/GUID-7A5623B0-9906-4959-9E98-3BDEA9DE4024.html) ·
[Access Control Event Types](https://tpp.hikvision.com/Wiki/ISAPI/Access%20Control%20on%20Person/GUID-079BE986-6D55-4F18-A4F2-A73DBD7442F9.html) ·
[FDLib FaceDataRecord](https://tpp.hikvision.com/Wiki/ISAPI/Access%20Control%20on%20Person/GUID-91A7BD78-D7A9-4014-A171-3A549DE81694.html) ·
[Event notification alertStream](https://tpp.hikvision.com/Wiki/ISAPI/Access%20Control%20on%20Person/GUID-C8398309-7417-4540-AF4F-4DA909E766D2.html) ·
[httpHosts (event listeners)](https://tpp.hikvision.com/wiki/isapi/anpr/GUID-E460E7D1-EC3C-4F65-B03F-4FF2E89A5566.html) ·
[How to get real-time events in listening mode (PDF)](https://www.hikvisioneurope.com/eu/portal/portal/Technology%20Partner%20Program/03-How%20to/How%20to%20get%20real-time%20event%20in%20listening%20mode.pdf) ·
[HikCentral Professional](https://www.hikvision.com/en/products/software/HikCentral-Professional-series/hikcentral-professional/) ·
[Hik-Connect Open Platform](https://open.ys7.com/)
