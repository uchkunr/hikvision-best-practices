---
name: hikvision-isapi
description: Build, debug and review integrations with Hikvision devices over ISAPI, the HTTP API of Hikvision IP cameras, NVRs, access control and face recognition terminals (DS-K1T, DS-K2), door stations and intercoms. Use when code calls /ISAPI/ endpoints, handles Hikvision Digest auth or login lockout, syncs persons, cards or faces to a terminal, opens doors, reads AcsEvent access logs or major/minor event codes, consumes alertStream or httpHosts events, grabs snapshots, builds RTSP URLs or drives PTZ. Not for HikCentral OpenAPI (artemis) or the HCNetSDK C library.
license: MIT
metadata:
  source: https://github.com/uchkunr/hikvision-best-practices
---

# Hikvision ISAPI

ISAPI is a per-device REST API at `http(s)://{device}/ISAPI/...`. There is no cloud; each device is called directly. XML is native; many endpoints, and most of `/ISAPI/AccessControl/`, also accept JSON with `?format=json`.

## Before writing code

1. Find out the device type (camera, NVR, access terminal) and, if possible, model and firmware. Behaviour differs between firmware versions of the same model.
2. Read the resource's `capabilities` endpoint before relying on optional fields or commands. Never assume a field exists because the guide lists it.
3. Use the reference files:
   - [references/endpoints.md](references/endpoints.md): endpoints, methods and request bodies for every area
   - [references/event-codes.md](references/event-codes.md): major/minor event codes and event payloads
   - [references/client.md](references/client.md): Digest client and pager implementations

## Rules that prevent the common bugs

**Auth**
- Use HTTP Digest (`qop=auth`, MD5 unless the challenge names another `algorithm`). Hash the exact path and query you send, including `?format=json`.
- Reuse the nonce and increment `nc`; on a new `401`, take the new challenge and retry once. Never loop on `401`.
- A `401` body with `<lockStatus>locked</lockStatus>` means the account is locked: stop and wait `<unlockTime>` seconds. The lock triggers after 3 to 20 failed attempts (5 by default).
- A `401` on one endpoint while `GET /ISAPI/System/deviceInfo` works means missing permission, not a wrong password.
- Bodies must be re-sendable (string, Buffer, FormData), because a fresh challenge sends the request twice.
- For HTTPS with the default self-signed certificate, trust that certificate for device requests only. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` or disable verification globally.

**Responses**
- Check `statusCode` in the body, not only the HTTP status. HTTP 200 with a failed `ResponseStatus` happens.
- `statusCode`: 1 OK, 2 Device Busy, 3 Device Error, 4 Invalid Operation, 5 Invalid Format, 6 Invalid Content, 7 Reboot Required, 9 Additional Error. Branch on `subStatusCode` (`notSupport`, `lowPrivilege`, `methodNotAllowed`, `badParameters`, ...), never on `statusString`.
- Creating a record that exists returns `statusCode` 6. Upsert = `Record`, then `Modify` on 6.
- On `methodNotAllowed`, some firmware wants `PUT` instead of `POST` or the reverse; retry once with the other.

**Searches**
- One `searchID` for all pages, `searchResultPosition` advanced by records received, `maxResults` 30 is safe.
- Continue only while `responseStatusStrg` is `MORE`; also stop on an empty page (some firmware says `MORE` forever). `NO MATCH` (with a space) means nothing found; do not treat a failed or empty search as "absent" before deleting.

**Access control**
- Everything hangs off the person's `employeeNo` (string, up to 32 chars). Create the person before cards or faces.
- Deletes are `PUT .../Delete` with a condition body, not HTTP `DELETE`.
- Face upload: `multipart/form-data`, part 1 `FaceDataRecord` JSON `{faceLibType:"blackFD", FDID:"1", FPID:<employeeNo>}`, part 2 the JPEG (named `img` or `FaceImage`; both appear in Hikvision samples). JPEG under 200 KB, one frontal face. Measure lengths in bytes.
- Door control: `PUT /ISAPI/AccessControl/RemoteControl/door/{n}` with XML `<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>`. Commands: `open`, `close`, `alwaysOpen`, `alwaysClose`, `resume`; check `door/capabilities`, not every model has all.
- Event search times are ISO 8601 with the device's UTC offset, and the device filters by its own clock. Always send `minor` (`0` = all).
- Card success is minor 1, fingerprint 38, face 75. Some firmware logs every success as 1, so use `currentVerifyMode` for the method and treat any `*_PASS` code as granted.
- Store the last event `serialNo` and skip older ones to make polling idempotent.

**Events**
- Hikvision names: **arming** = you hold `GET /ISAPI/Event/notification/alertStream` open (multipart/mixed); **listening** = the device POSTs to a host set in `/ISAPI/Event/notification/httpHosts`.
- alertStream: take the boundary from `Content-Type`, cut parts by `Content-Length`, expect XML, JSON and JPEG parts. Drop `videoloss`/`inactive` heartbeats. Reconnect when nothing arrives for a minute or two.
- `PUT httpHosts` replaces the whole list; `GET` first and keep entries you do not own. Test with `POST httpHosts/{id}/test`. Reply `200` immediately in the handler.
- Events only reach either channel if their linkage includes `center` ("notify surveillance center").
- Live channels drop events while disconnected; back them with periodic `AcsEvent` searches.

**Video**
- Streaming channel IDs are `{camera}{stream}`: `101` main, `102` sub. PTZ uses the plain camera number (`/ISAPI/PTZCtrl/channels/1/...`).
- RTSP live: `rtsp://{device}:554/Streaming/Channels/101`. Playback: `/Streaming/tracks/101?starttime=YYYYMMDDTHHMMSSZ&endtime=...`. URL-encode passwords in RTSP URLs.
- PTZ continuous move keeps going until you send `pan`/`tilt`/`zoom` all zero. Always send the stop.

## Working style

- Prefer a small client with Digest, ResponseStatus checks and a generic pager over ad-hoc `fetch` calls.
- Limit concurrency to a few requests per device; devices have few connection slots.
- Store devices by `serialNumber`, not IP.
- When a call fails, log model, firmware, URL, request body and the full `ResponseStatus`.
- Say clearly when behaviour is firmware-dependent, and suggest checking `capabilities` or the device web UI's network tab rather than guessing.
