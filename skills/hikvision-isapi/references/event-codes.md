# Event codes and payloads

Minor codes only mean something together with their major. ISAPI uses decimal values.

## Major

| Major | Name |
| --- | --- |
| 1 | `MAJOR_ALARM` |
| 2 | `MAJOR_EXCEPTION` |
| 3 | `MAJOR_OPERATION` |
| 5 | `MAJOR_EVENT` (authentication, door, button) |

## Minor under major 5

| Dec | Hex | Name |
| --- | --- | --- |
| 1 | 0x01 | `MINOR_LEGAL_CARD_PASS` |
| 2 | 0x02 | `MINOR_CARD_AND_PSW_PASS` |
| 3 | 0x03 | `MINOR_CARD_AND_PSW_FAIL` |
| 4 | 0x04 | `MINOR_CARD_AND_PSW_TIMEOUT` |
| 6 | 0x06 | `MINOR_CARD_NO_RIGHT` |
| 7 | 0x07 | `MINOR_CARD_INVALID_PERIOD` |
| 8 | 0x08 | `MINOR_CARD_OUT_OF_DATE` |
| 9 | 0x09 | `MINOR_INVALID_CARD` |
| 10 | 0x0A | `MINOR_ANTI_SNEAK_FAIL` |
| 11 | 0x0B | `MINOR_INTERLOCK_DOOR_NOT_CLOSE` |
| 16 | 0x10 | `MINOR_MULTI_VERIFY_SUCCESS` |
| 19 | 0x13 | `MINOR_ALWAYS_OPEN_BEGIN` |
| 20 | 0x14 | `MINOR_ALWAYS_OPEN_END` |
| 21 | 0x15 | `MINOR_LOCK_OPEN` |
| 22 | 0x16 | `MINOR_LOCK_CLOSE` |
| 23 | 0x17 | `MINOR_DOOR_BUTTON_PRESS` |
| 24 | 0x18 | `MINOR_DOOR_BUTTON_RELEASE` |
| 25 | 0x19 | `MINOR_DOOR_OPEN_NORMAL` |
| 26 | 0x1A | `MINOR_DOOR_CLOSE_NORMAL` |
| 27 | 0x1B | `MINOR_DOOR_OPEN_ABNORMAL` |
| 28 | 0x1C | `MINOR_DOOR_OPEN_TIMEOUT` |
| 31 | 0x1F | `MINOR_ALWAYS_CLOSE_BEGIN` |
| 32 | 0x20 | `MINOR_ALWAYS_CLOSE_END` |
| 37 | 0x25 | `MINOR_DOORBELL_RINGING` |
| 38 | 0x26 | `MINOR_FINGERPRINT_COMPARE_PASS` |
| 39 | 0x27 | `MINOR_FINGERPRINT_COMPARE_FAIL` |
| 40 | 0x28 | `MINOR_CARD_FINGERPRINT_VERIFY_PASS` |
| 41 | 0x29 | `MINOR_CARD_FINGERPRINT_VERIFY_FAIL` |
| 49 | 0x31 | `MINOR_FINGERPRINT_INEXISTENCE` |
| 54 | 0x36 | `MINOR_FACE_AND_FP_VERIFY_PASS` |
| 57 | 0x39 | `MINOR_FACE_AND_PW_VERIFY_PASS` |
| 60 | 0x3C | `MINOR_FACE_AND_CARD_VERIFY_PASS` |
| 61 | 0x3D | `MINOR_FACE_AND_CARD_VERIFY_FAIL` |
| 75 | 0x4B | `MINOR_FACE_VERIFY_PASS` |
| 76 | 0x4C | `MINOR_FACE_VERIFY_FAIL` |
| 77 | 0x4D | `MINOR_EMPLOYEENO_AND_FACE_VERIFY_PASS` |
| 78 | 0x4E | `MINOR_EMPLOYEENO_AND_FACE_VERIFY_FAIL` |
| 80 | 0x50 | Face not recognised / not enrolled (named `MINOR_FACE_RECOGNIZE_FAIL` or `MINOR_FACE_NO_EXIST` depending on the SDK version) |
| 101 | 0x65 | `MINOR_EMPLOYEENO_AND_PW_PASS` |
| 102 | 0x66 | `MINOR_EMPLOYEENO_AND_PW_FAIL` |
| 104 | 0x68 | `MINOR_HUMAN_DETECT_FAIL` |
| 151 | 0x97 | `MINOR_PASSWORD_MISMATCH` |
| 152 | 0x98 | `MINOR_EMPLOYEE_NO_NOT_EXIST` |
| 153 | 0x99 | `MINOR_COMBINED_VERIFY_PASS` |

Names with `_PASS` mean access granted. The `0x28`–`0x4A` range holds pass/fail/timeout codes for combined modes (card + fingerprint, face + PIN, and so on).

## Minor under major 3

| Dec | Hex | Name |
| --- | --- | --- |
| 1024 | 0x400 | `MINOR_REMOTE_OPEN_DOOR` |
| 1025 | 0x401 | `MINOR_REMOTE_CLOSE_DOOR` |

## Firmware caveats

- Some terminals log every successful verification, face included, as minor 1. Use `currentVerifyMode` for the method.
- Some firmware rejects an AcsEvent search without `minor`; send `minor: 0` for all.
- Verify the codes your model emits before building reports on exact values.

## Live payloads

alertStream and httpHosts deliver `EventNotificationAlert` documents:

- Cameras (XML): `ipAddress`, `channelID`, `dateTime`, `activePostCount`, `eventType` (e.g. `VMD`, `linedetection`, `fielddetection`, `tamperdetection`), `eventState` (`active`/`inactive`), `eventDescription`.
- Heartbeat: `eventType` `videoloss` with `eventState` `inactive`. Not an event.
- Access terminals (JSON): `eventType` `AccessControllerEvent` with an `AccessControllerEvent` object: `majorEventType`, `subEventType` (same codes as above), `employeeNoString`, `name`, `cardNo`, `currentVerifyMode`, `serialNo`, optional picture part after it.
