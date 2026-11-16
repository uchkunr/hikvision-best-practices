# ISAPI endpoints

`{json}` means the endpoint takes `?format=json`. Everything else is XML unless the device supports JSON for it.

## System and security

| Method | Endpoint | Notes |
| --- | --- | --- |
| GET | `/ISAPI/System/deviceInfo` | model, serialNumber, macAddress, firmwareVersion. XML on cameras/NVRs |
| GET | `/ISAPI/System/capabilities` | device capabilities |
| GET | `/ISAPI/System/status` | CPU, memory, uptime |
| GET, PUT | `/ISAPI/System/time` | `timeMode` (`manual`, `NTP`, ...), `localTime`, `timeZone` (POSIX, e.g. `CST-5:00:00` = UTC+5) |
| GET, PUT | `/ISAPI/System/time/ntpServers` | |
| GET, PUT | `/ISAPI/System/Network/interfaces/{id}` | |
| PUT | `/ISAPI/System/reboot` | |
| PUT | `/ISAPI/System/factoryReset?mode=` | `full` (default, everything), `basic` (keeps network and users), `part` |
| GET, POST | `/ISAPI/Security/users` | device login accounts |
| GET, PUT, DELETE | `/ISAPI/Security/users/{id}` | |
| GET | `/ISAPI/Security/userCheck` | credential check; `lockStatus`, `unlockTime`, `retryLoginTime` |
| GET, PUT | `/ISAPI/Security/illegalLoginLock` | `maxIllegalLoginTimes` 3–20, default 5 |
| POST | `/ISAPI/ContentMgmt/logSearch` | device logs |

## Persons (UserInfo) {json}

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/AccessControl/UserInfo/capabilities` |
| GET | `/ISAPI/AccessControl/UserInfo/Count` → `UserInfoCount.userNumber` |
| POST | `/ISAPI/AccessControl/UserInfo/Search` |
| POST | `/ISAPI/AccessControl/UserInfo/Record` (create) |
| PUT | `/ISAPI/AccessControl/UserInfo/Modify` (update, omitted fields kept) |
| PUT | `/ISAPI/AccessControl/UserInfo/SetUp` (create or replace; not on all firmware) |
| PUT | `/ISAPI/AccessControl/UserInfo/Delete` |

```json
{"UserInfo": {
  "employeeNo": "1001", "name": "Aliyev Jasur", "userType": "normal",
  "Valid": {"enable": true, "beginTime": "2026-01-01T00:00:00", "endTime": "2036-12-31T23:59:59", "timeType": "local"},
  "doorRight": "1", "RightPlan": [{"doorNo": 1, "planTemplateNo": "1"}]
}}
```

`userType`: `normal`, `visitor`, `blackList`. Optional: `password` (PIN), `gender`. `maxTimes` breaks older firmware; send only if needed.

Search: `{"UserInfoSearchCond": {"searchID": "...", "searchResultPosition": 0, "maxResults": 30, "EmployeeNoList": [{"employeeNo": "1001"}]}}` → `UserInfoSearch.UserInfo[]`.

Delete: `{"UserInfoDelCond": {"EmployeeNoList": [{"employeeNo": "1001"}]}}`. Bulk delete with progress on newer terminals: `PUT /ISAPI/AccessControl/UserInfoDetail/Delete` (check capabilities).

## Cards (CardInfo) {json}

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/AccessControl/CardInfo/capabilities` |
| GET | `/ISAPI/AccessControl/CardInfo/Count` (optional `&employeeNo=`) |
| POST | `/ISAPI/AccessControl/CardInfo/Search` |
| POST | `/ISAPI/AccessControl/CardInfo/Record` |
| PUT | `/ISAPI/AccessControl/CardInfo/Modify` |
| PUT | `/ISAPI/AccessControl/CardInfo/Delete` |

Add: `{"CardInfo": {"employeeNo": "1001", "cardNo": "0012345678", "cardType": "normalCard"}}`. `cardNo` is a string; keep leading zeros and the reader's number format.

Search: `CardInfoSearchCond` with `EmployeeNoList` or `CardNoList` → `CardInfoSearch.CardInfo[]`.

Delete: `{"CardInfoDelCond": {"CardNoList": [{"cardNo": "..."}]}}` or `{"CardInfoDelCond": {"EmployeeNoList": [{"employeeNo": "..."}]}}`.

## Faces (FDLib) {json}

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/Intelligent/FDLib/capabilities` |
| GET | `/ISAPI/Intelligent/FDLib` (list libraries) |
| GET | `/ISAPI/Intelligent/FDLib/Count?FDID=1&faceLibType=blackFD` |
| POST | `/ISAPI/Intelligent/FDLib/FaceDataRecord` (multipart) |
| PUT | `/ISAPI/Intelligent/FDLib/FDSetUp` (add or replace; not on all firmware) |
| POST | `/ISAPI/Intelligent/FDLib/FDSearch` |
| PUT | `/ISAPI/Intelligent/FDLib/FDSearch/Delete?FDID=1&faceLibType=blackFD` |

Upload, `multipart/form-data`, in order:
1. part `FaceDataRecord`: `{"faceLibType": "blackFD", "FDID": "1", "FPID": "1001"}`
2. JPEG part (`img` or `FaceImage`), `Content-Type: image/jpeg`

Alternative: JSON body with `"faceURL": "http://..."` that the device downloads.

FDSearch: `{"searchResultPosition": 0, "maxResults": 30, "faceLibType": "blackFD", "FDID": "1", "FPID": "1001"}`.
Delete body: `{"FPID": [{"value": "1001"}]}`.

## Doors

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/AccessControl/RemoteControl/door/capabilities` (`<doorNo min max>`, `<cmd opt>`) |
| PUT | `/ISAPI/AccessControl/RemoteControl/door/{doorNo}` |
| GET | `/ISAPI/AccessControl/AcsWorkStatus?format=json` (`doorLockStatus` 0 = locked, `magneticStatus` 1 = open) |
| GET, PUT | `/ISAPI/AccessControl/Door/param/{doorNo}` |

Body: `<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>`; `cmd` = `open`, `close`, `alwaysOpen`, `alwaysClose`, `resume`.

## Access events {json}

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/AccessControl/AcsEvent/capabilities` |
| POST | `/ISAPI/AccessControl/AcsEvent` |
| POST | `/ISAPI/AccessControl/AcsEventTotalNum` |

```json
{"AcsEventCond": {"searchID": "poll-1", "searchResultPosition": 0, "maxResults": 30,
  "major": 5, "minor": 0,
  "startTime": "2026-11-16T00:00:00+05:00", "endTime": "2026-11-16T23:59:59+05:00"}}
```

Response `AcsEvent`: `responseStatusStrg`, `numOfMatches`, `totalMatches`, `InfoList[]` with `major`, `minor`, `time`, `employeeNoString`, `name`, `cardNo`, `doorNo`, `currentVerifyMode`, `serialNo`, `pictureURL`.

## Real-time events

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/Event/notification/alertStream` (arming; multipart/mixed, never ends) |
| GET | `/ISAPI/Event/notification/httpHosts/capabilities` |
| GET, PUT | `/ISAPI/Event/notification/httpHosts` (PUT replaces the whole list) |
| GET, PUT | `/ISAPI/Event/notification/httpHosts/{id}` |
| POST | `/ISAPI/Event/notification/httpHosts/{id}/test` |
| GET, PUT | `/ISAPI/Event/triggers/{id}` (linkage; needs `center` for delivery) |

```xml
<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <HttpHostNotification>
    <id>1</id><url>/hik/events</url><protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType><addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>192.168.1.10</ipAddress><portNo>8080</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>
```

`protocolType` HTTP/HTTPS; `parameterFormatType` XML/JSON; `httpAuthenticationMethod` `none` or `MD5digest`; `eventMode` `all` or `list`.

## Video and PTZ

| Method | Endpoint |
| --- | --- |
| GET | `/ISAPI/Streaming/channels` |
| GET, PUT | `/ISAPI/Streaming/channels/{id}` (id = 101, 102, ...) |
| GET | `/ISAPI/Streaming/channels/{id}/capabilities` |
| GET | `/ISAPI/Streaming/channels/{id}/picture` (JPEG; optional `videoResolutionWidth`, `videoResolutionHeight`) |
| GET | `/ISAPI/PTZCtrl/channels/{camera}/capabilities` |
| PUT | `/ISAPI/PTZCtrl/channels/{camera}/continuous` `<PTZData><pan>60</pan><tilt>0</tilt><zoom>0</zoom></PTZData>`, -100..100, zeros = stop |
| GET | `/ISAPI/PTZCtrl/channels/{camera}/status` |
| GET | `/ISAPI/PTZCtrl/channels/{camera}/presets` |
| PUT | `/ISAPI/PTZCtrl/channels/{camera}/presets/{presetId}/goto` |

RTSP: `rtsp://{device}:554/Streaming/Channels/101` (live), `rtsp://{device}:554/Streaming/tracks/101?starttime=20261116T080000Z&endtime=20261116T090000Z` (playback). `/ISAPI/Streaming/channels/101/httpPreview` is HTTP MJPEG, not RTSP.

## ResponseStatus sub-codes

| subStatusCode | statusCode | errorCode |
| --- | --- | --- |
| `deviceBusy` | 2 | `0x20000004` |
| `notSupport` | 4 | `0x40000001` |
| `lowPrivilege` | 4 | `0x40000002` |
| `badAuthorization` | 4 | `0x40000003` |
| `methodNotAllowed` | 4 | `0x40000004` |
| `invalidOperation` | 4 | `0x40000006` |
| `badXmlFormat` | 5 | `0x50000001` |
| `badParameters` | 6 | `0x60000001` |
| `badXmlContent` | 6 | `0x60000003` |

`errorCode` is returned in decimal (`0x40000001` = 1073741825).
