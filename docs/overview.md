# Overview

ISAPI (Intelligent Security API) is the HTTP API built into Hikvision IP cameras, NVRs, DVRs, access control terminals, door stations and intercoms. It follows a REST style: resources live under `/ISAPI/...`, and you read them with `GET`, change them with `PUT`, create them with `POST` and remove them with `DELETE`.

There is no cloud in the middle. You talk to each device directly, over its LAN or VPN address. Platforms such as HikCentral sit on top of the devices and have their own, separate API.

## Which API to use

| API | What it is for | Auth | Base URL |
| --- | --- | --- | --- |
| ISAPI over HTTP | Full control of one device on your network | Digest (Basic if enabled) | `http://{device}/ISAPI/...` |
| ISAPI over HTTPS | Same, encrypted | Digest (Basic if enabled) | `https://{device}/ISAPI/...` |
| RTSP | Live and recorded video only | Digest or Basic, per RTSP | `rtsp://{device}:554/Streaming/Channels/101` |
| ONVIF | Vendor-neutral subset: discovery, streams, PTZ | WS-Security | `http://{device}/onvif/device_service` |
| HikCentral OpenAPI | Many devices through a HikCentral server | AppKey/AppSecret signature | `https://{platform}/artemis/api/...` |

Use ISAPI when your software talks to devices directly. Use HikCentral OpenAPI when the site is already managed by HikCentral and you should not bypass it.

## Resource tree

| Prefix | Contents |
| --- | --- |
| `/ISAPI/System/...` | Device info, time, network, reboot, upgrade |
| `/ISAPI/Security/...` | Users, login lock, certificates |
| `/ISAPI/Streaming/...` | Video channels and snapshots |
| `/ISAPI/PTZCtrl/...` | Pan, tilt, zoom, presets |
| `/ISAPI/Image/...` | Image and encoding settings |
| `/ISAPI/Event/...` | Event triggers, alert stream, HTTP push hosts |
| `/ISAPI/ContentMgmt/...` | Storage, recordings, log search |
| `/ISAPI/AccessControl/...` | Persons, cards, doors, access events |
| `/ISAPI/Intelligent/...` | Face libraries (FDLib) and analytics |

## Concepts you will meet everywhere

- **Capabilities first.** Almost every resource has a `.../capabilities` sibling that says which fields, ranges and commands this model and firmware support. Read it before you rely on an optional feature. Models differ more than the documentation suggests.
- **JSON or XML.** XML always works. Many newer endpoints, and most of `/ISAPI/AccessControl/`, also accept JSON when you add `?format=json`. Some, such as `/ISAPI/System/deviceInfo` on cameras, stay XML-only. See [Requests and responses](requests.md).
- **Channels.** Streaming channel IDs combine camera and stream: `101` is camera 1 main stream, `102` is camera 1 sub stream, `201` is camera 2 main stream. PTZ and most other resources use the plain camera number (`1`).
- **Persons and `employeeNo`.** On access terminals, everything (cards, faces, fingerprints, events) hangs off a person's `employeeNo`, a string of up to 32 characters. Use your own system's stable ID here.
- **Doors.** Doors are numbered from `1`. Most face terminals control a single door.
- **Time.** Times are ISO 8601 with a UTC offset, for example `2026-11-16T09:30:00+05:00`. Keep the device on NTP; event searches filter by the device's own clock.

## Next

- [Authentication](authentication.md)
- [Requests and responses](requests.md)
