# Real-time events

Hikvision devices deliver events in two ways. Hikvision's own names for them are easy to mix up:

| Mode | Who connects | Endpoint | Use when |
| --- | --- | --- | --- |
| **Arming** (alert stream) | You connect to the device and keep the connection open | `GET /ISAPI/Event/notification/alertStream` | You can reach the device; a few devices per process |
| **Listening** (HTTP host) | The device connects to your server and POSTs each event | `PUT /ISAPI/Event/notification/httpHosts` | Many devices, or devices behind NAT that can reach you |

For access terminals, also poll [`AcsEvent`](access-control/events.md) now and then with the last `serialNo` you stored. Both live modes drop events while you are disconnected; the search catches up.

## Arming mode: alertStream

```http
GET /ISAPI/Event/notification/alertStream HTTP/1.1
Authorization: Digest ...
```

The device answers `200` and never ends the response. The body is `multipart/mixed`. Take the boundary from the `Content-Type` header (often `MIME_boundary`):

```text
--MIME_boundary
Content-Type: application/xml; charset="UTF-8"
Content-Length: 480

<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <ipAddress>192.168.1.64</ipAddress>
  <channelID>1</channelID>
  <dateTime>2026-11-16T09:30:00+05:00</dateTime>
  <activePostCount>1</activePostCount>
  <eventType>VMD</eventType>
  <eventState>active</eventState>
  <eventDescription>Motion alarm</eventDescription>
</EventNotificationAlert>
--MIME_boundary
```

- Parts can be XML or JSON (access terminals send JSON with an `AccessControllerEvent` object), and a JPEG part can follow an event.
- Use `Content-Length` to cut each part when it is present; fall back to searching for the next boundary when it is not.
- **Heartbeat.** Cameras send an `EventNotificationAlert` with `eventType` `videoloss` and `eventState` `inactive` while idle. It is not an event; drop it. If nothing at all arrives for a while (a minute or two), assume the connection is dead and reconnect. TCP will not always tell you.
- Each open stream uses one of the device's limited connection slots. Open one per device, not one per consumer.

Access-terminal event (JSON part):

```json
{
  "ipAddress": "192.168.1.64",
  "dateTime": "2026-11-16T08:59:12+05:00",
  "eventType": "AccessControllerEvent",
  "eventState": "active",
  "AccessControllerEvent": {
    "majorEventType": 5,
    "subEventType": 75,
    "employeeNoString": "1001",
    "name": "Aliyev Jasur",
    "currentVerifyMode": "face",
    "serialNo": 5821
  }
}
```

`majorEventType`/`subEventType` are the same major and minor codes as in [Access events](access-control/events.md#event-codes).

Example: [`examples/alert-stream.ts`](../examples/alert-stream.ts)

## Listening mode: httpHosts

| Operation | Method | Endpoint |
| --- | --- | --- |
| Capabilities | GET | `/ISAPI/Event/notification/httpHosts/capabilities` |
| Read or set all hosts | GET, PUT | `/ISAPI/Event/notification/httpHosts` |
| One host | GET, PUT | `/ISAPI/Event/notification/httpHosts/{id}` |
| Send a test message | POST | `/ISAPI/Event/notification/httpHosts/{id}/test` |

```xml
<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <HttpHostNotification>
    <id>1</id>
    <url>/hik/events</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>192.168.1.10</ipAddress>
    <portNo>8080</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>
```

| Field | Values |
| --- | --- |
| `protocolType` | `HTTP`, `HTTPS` |
| `parameterFormatType` | `XML`, `JSON` |
| `addressingFormatType` | `ipaddress` (use `ipAddress`) or `hostname` (use `hostName`) |
| `httpAuthenticationMethod` | `none` or `MD5digest` (set `userName`/`password`) |
| `eventMode` | `all`, or `list` with an `EventList` of event types |

1. `GET` the current list first, and keep the entries you do not own. `PUT` on `httpHosts` replaces the whole list.
2. `PUT` your host.
3. `POST .../httpHosts/1/test` to make the device send a test message.
4. Events of types that are enabled and linked to "notify surveillance center" then arrive as `POST`s to your URL, as single XML/JSON bodies or as multipart with pictures.

Your handler must answer `200` fast. Process the event after replying, or put it on a queue.

Example: [`examples/http-host-listener.ts`](../examples/http-host-listener.ts)

## Enabling events

An event only reaches either channel if it is enabled on the device and its linkage includes "notify surveillance center" (`center` in the trigger's notification list). On cameras this is in `/ISAPI/Event/triggers/{id}`. If nothing arrives, check this before you debug your parser.
