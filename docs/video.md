# Video, snapshots and PTZ

## Channel IDs

Streaming resources use `{camera}{stream}`: `101` is camera 1 main stream, `102` camera 1 sub stream, `103` third stream where it exists, `201` camera 2 main stream. On an NVR, the camera number is the NVR channel.

PTZ, image settings and most non-streaming resources use the plain camera number (`1`, `2`), not `101`.

## Streaming channels

| Operation | Method | Endpoint |
| --- | --- | --- |
| List channels | GET | `/ISAPI/Streaming/channels` |
| Channel settings | GET, PUT | `/ISAPI/Streaming/channels/{id}` |
| Channel capabilities | GET | `/ISAPI/Streaming/channels/{id}/capabilities` |
| Snapshot | GET | `/ISAPI/Streaming/channels/{id}/picture` |

Channel settings carry the codec (H.264/H.265), resolution, frame rate and bitrate. `GET` first, change only the fields you need, then `PUT` the whole document back.

## Snapshot

```bash
curl --digest -u admin:PASSWORD -o snap.jpg \
  http://192.168.1.64/ISAPI/Streaming/channels/101/picture
```

Optional query parameters: `videoResolutionWidth` and `videoResolutionHeight`. A snapshot takes a fraction of a second to a few seconds; do not poll it as a video feed. Use RTSP for that.

Example: [`examples/snapshot.ts`](../examples/snapshot.ts)

## RTSP

Live view:

```text
rtsp://192.168.1.64:554/Streaming/Channels/101
rtsp://192.168.1.64:554/ISAPI/Streaming/channels/101
```

Playback from an NVR or camera storage (times in UTC, `YYYYMMDDTHHMMSSZ`):

```text
rtsp://192.168.1.64:554/Streaming/tracks/101?starttime=20261116T080000Z&endtime=20261116T090000Z
```

Both the short form and the `/ISAPI/...` form are accepted; the short form is the one most tools expect.

- RTSP uses its own Digest or Basic auth. Most players accept `rtsp://user:pass@host/...`; URL-encode special characters in the password (`@` becomes `%40`).
- `/Streaming/Channels/101` is RTSP. `/ISAPI/Streaming/channels/101/httpPreview` is a different thing: an HTTP MJPEG preview that only some devices support.
- For a browser, restream through a media server (MediaMTX, go2rtc and similar) instead of exposing the camera.

## PTZ

| Operation | Method | Endpoint |
| --- | --- | --- |
| Capabilities | GET | `/ISAPI/PTZCtrl/channels/{camera}/capabilities` |
| Continuous move | PUT | `/ISAPI/PTZCtrl/channels/{camera}/continuous` |
| Status (position) | GET | `/ISAPI/PTZCtrl/channels/{camera}/status` |
| List presets | GET | `/ISAPI/PTZCtrl/channels/{camera}/presets` |
| Go to preset | PUT | `/ISAPI/PTZCtrl/channels/{camera}/presets/{presetId}/goto` |

Continuous move, XML:

```xml
<PTZData>
  <pan>60</pan>
  <tilt>0</tilt>
  <zoom>0</zoom>
</PTZData>
```

- Speeds go from `-100` to `100`. Negative `pan` is left, negative `tilt` is down, negative `zoom` is zoom out.
- The camera keeps moving until you send all zeros. Always send the stop, including when your own code fails mid-way, or the camera ends up at its limit.
- PTZ uses the camera number: `/ISAPI/PTZCtrl/channels/1/continuous`, not `.../101/...`.
