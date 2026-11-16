# Access events (AcsEvent)

Every card tap, face match, button press and door state change on an access terminal is stored as an event. You can search the stored events, or receive them live (see [Real-time events](../events.md)).

| Operation | Method | Endpoint |
| --- | --- | --- |
| Capabilities | GET | `/ISAPI/AccessControl/AcsEvent/capabilities?format=json` |
| Search | POST | `/ISAPI/AccessControl/AcsEvent?format=json` |
| Count | POST | `/ISAPI/AccessControl/AcsEventTotalNum?format=json` |

## Search

```json
{
  "AcsEventCond": {
    "searchID": "poll-1",
    "searchResultPosition": 0,
    "maxResults": 30,
    "major": 5,
    "minor": 0,
    "startTime": "2026-11-16T00:00:00+05:00",
    "endTime": "2026-11-16T23:59:59+05:00"
  }
}
```

- `major`: `5` for access events. `0` is all majors on firmware that allows it.
- `minor`: a specific code from the table below, or `0` for all. Some firmware rejects a query without `minor`, so always send it.
- `startTime`/`endTime`: ISO 8601 with the device's UTC offset. The device filters by its own clock.
- Optional filters on newer firmware include `employeeNoString`, `cardNo`, `timeReverseOrder` (newest first) and `eventAttribute` (`attendance`, `other`).

Response, in `AcsEvent`:

```json
{
  "AcsEvent": {
    "searchID": "poll-1",
    "responseStatusStrg": "MORE",
    "numOfMatches": 30,
    "totalMatches": 214,
    "InfoList": [
      {
        "major": 5,
        "minor": 75,
        "time": "2026-11-16T08:59:12+05:00",
        "employeeNoString": "1001",
        "name": "Aliyev Jasur",
        "cardNo": "",
        "doorNo": 1,
        "currentVerifyMode": "face",
        "serialNo": 5821,
        "pictureURL": "http://192.168.1.64/..."
      }
    ]
  }
}
```

- `serialNo` increases with every event on the device. Store the last one you processed and skip anything at or below it; it makes polling idempotent.
- `employeeNoString` is the person. Older firmware has a numeric `employeeNo` instead.
- `pictureURL`, when present, needs the same Digest credentials to download.
- Paging works as in [Requests and responses](../requests.md#search-and-pagination).

## Event codes

### Major types

| Major | Hex | Name |
| --- | --- | --- |
| 1 | `0x1` | Alarm (`MAJOR_ALARM`) |
| 2 | `0x2` | Exception (`MAJOR_EXCEPTION`) |
| 3 | `0x3` | Operation (`MAJOR_OPERATION`) |
| 5 | `0x5` | Event (`MAJOR_EVENT`): authentication and door events |

Minor codes only have meaning together with their major. The same number means different things under different majors.

### Common minor codes under major 5

| Minor | Hex | Name | Meaning |
| --- | --- | --- | --- |
| 1 | `0x01` | `MINOR_LEGAL_CARD_PASS` | Valid card, access granted |
| 2 | `0x02` | `MINOR_CARD_AND_PSW_PASS` | Card and PIN passed |
| 3 | `0x03` | `MINOR_CARD_AND_PSW_FAIL` | Card and PIN failed |
| 6 | `0x06` | `MINOR_CARD_NO_RIGHT` | Card has no right for this door |
| 7 | `0x07` | `MINOR_CARD_INVALID_PERIOD` | Card used outside its schedule |
| 8 | `0x08` | `MINOR_CARD_OUT_OF_DATE` | Card expired |
| 9 | `0x09` | `MINOR_INVALID_CARD` | Unknown card (use it to enrol cards by tapping) |
| 21 | `0x15` | `MINOR_LOCK_OPEN` | Lock opened |
| 22 | `0x16` | `MINOR_LOCK_CLOSE` | Lock closed |
| 23 | `0x17` | `MINOR_DOOR_BUTTON_PRESS` | Exit button pressed |
| 24 | `0x18` | `MINOR_DOOR_BUTTON_RELEASE` | Exit button released |
| 25 | `0x19` | `MINOR_DOOR_OPEN_NORMAL` | Door opened (door contact) |
| 26 | `0x1A` | `MINOR_DOOR_CLOSE_NORMAL` | Door closed (door contact) |
| 27 | `0x1B` | `MINOR_DOOR_OPEN_ABNORMAL` | Door forced open |
| 28 | `0x1C` | `MINOR_DOOR_OPEN_TIMEOUT` | Door held open too long |
| 37 | `0x25` | `MINOR_DOORBELL_RINGING` | Doorbell |
| 38 | `0x26` | `MINOR_FINGERPRINT_COMPARE_PASS` | Fingerprint matched |
| 39 | `0x27` | `MINOR_FINGERPRINT_COMPARE_FAIL` | Fingerprint not matched |
| 75 | `0x4B` | `MINOR_FACE_VERIFY_PASS` | Face matched |
| 76 | `0x4C` | `MINOR_FACE_VERIFY_FAIL` | Face not matched |
| 77 | `0x4D` | `MINOR_EMPLOYEENO_AND_FACE_VERIFY_PASS` | Employee number and face passed |
| 101 | `0x65` | `MINOR_EMPLOYEENO_AND_PW_PASS` | Employee number and PIN passed |
| 102 | `0x66` | `MINOR_EMPLOYEENO_AND_PW_FAIL` | Employee number and PIN failed |

Combined modes (card + face, face + fingerprint, and so on) have their own pass, fail and timeout codes in the `0x28`–`0x4A` range.

### Under major 3 (operation)

| Minor | Hex | Name |
| --- | --- | --- |
| 1024 | `0x400` | `MINOR_REMOTE_OPEN_DOOR` |
| 1025 | `0x401` | `MINOR_REMOTE_CLOSE_DOOR` |

### Do not trust one code per method

Firmware does not always use the code that matches the method. Some terminals log every successful verification, face included, as minor `1`. To know whether access was granted and how:

- treat any `*_PASS` minor as granted, not only `75`
- read `currentVerifyMode` (`card`, `face`, `fingerPrint`, `cardOrFace` and so on) for the method
- test the codes your model actually emits before building reports on them

The full list of names comes from the `MINOR_*` constants in Hikvision's HCNetSDK headers. Values here are the decimal form ISAPI uses.

Example: [`examples/access-events.ts`](../../examples/access-events.ts)
