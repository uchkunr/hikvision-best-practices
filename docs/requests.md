# Requests and responses

## JSON and XML

- XML is the native format. Requests use `Content-Type: application/xml`, and XML bodies carry the namespace `xmlns="http://www.isapi.org/ver20/XMLSchema"`.
- Add `?format=json` to use JSON on endpoints that support it, and send `Content-Type: application/json`. JSON keys keep the XML names: objects in UpperCamelCase (`UserInfo`, `AcsEventCond`), fields in lowerCamelCase (`employeeNo`).
- If a JSON request returns XML, or `badJsonFormat`/`notSupport`, that endpoint is XML-only on this firmware.
- Binary data (firmware, config files) is sent as `application/octet-stream`.
- Use UTF-8 for names and other text.

## ResponseStatus

`PUT`, `POST` and `DELETE` answer with a status object, in JSON or XML to match the request:

```json
{
  "requestURL": "/ISAPI/AccessControl/UserInfo/Record?format=json",
  "statusCode": 1,
  "statusString": "OK",
  "subStatusCode": "ok"
}
```

On failure `statusCode` is greater than 1, and `errorCode`/`errorMsg` may be added:

```json
{
  "statusCode": 4,
  "statusString": "Invalid Operation",
  "subStatusCode": "notSupport",
  "errorCode": 1073741825,
  "errorMsg": "notSupport"
}
```

| `statusCode` | `statusString` |
| --- | --- |
| 0, 1 | OK |
| 2 | Device Busy |
| 3 | Device Error |
| 4 | Invalid Operation |
| 5 | Invalid XML Format (or JSON format) |
| 6 | Invalid XML Content (or JSON content) |
| 7 | Reboot Required |
| 9 | Additional Error (batch operation, see `AdditionalErr`) |

Common `subStatusCode` values:

| `subStatusCode` | `statusCode` | `errorCode` | Meaning |
| --- | --- | --- | --- |
| `deviceBusy` | 2 | `0x20000004` | Busy; retry later |
| `notSupport` | 4 | `0x40000001` | Not supported by this device |
| `lowPrivilege` | 4 | `0x40000002` | Account lacks permission |
| `badAuthorization` | 4 | `0x40000003` | Authentication failed |
| `methodNotAllowed` | 4 | `0x40000004` | Wrong HTTP method for this resource |
| `invalidOperation` | 4 | `0x40000006` | Operation not allowed now |
| `badXmlFormat` | 5 | `0x50000001` | Body does not parse |
| `badParameters` | 6 | `0x60000001` | A field has a wrong value |
| `badXmlContent` | 6 | `0x60000003` | Body parses but content is wrong |

`errorCode` is the decimal form of the hex code (`0x40000001` = `1073741825`).

Rules:

- **Check `statusCode`, not only the HTTP status.** Some devices answer HTTP 200 and still reject the command in the body.
- **Branch on `subStatusCode`.** It is stable and machine-readable. `statusString` and `errorMsg` are for humans.
- **Access-control duplicates are code 6.** Creating a person or card that already exists fails with `statusCode` 6 and a sub-code such as `deviceUserAlreadyExist` or `employeeNoAlreadyExist`. Firmware differs in the exact name, so treat "6 on create" as "exists, use Modify".

## Search and pagination

Searches (`UserInfo/Search`, `CardInfo/Search`, `AcsEvent`, `FDLib/FDSearch` and others) share one pattern.

Request:

```json
{
  "UserInfoSearchCond": {
    "searchID": "sync-20261116",
    "searchResultPosition": 0,
    "maxResults": 30
  }
}
```

- `searchID`: any string. Keep it the same for every page of one search.
- `searchResultPosition`: offset of the first record, starting at 0.
- `maxResults`: page size. Devices cap it (often 30 or 50) and may return fewer.

Response:

```json
{
  "UserInfoSearch": {
    "searchID": "sync-20261116",
    "responseStatusStrg": "MORE",
    "numOfMatches": 30,
    "totalMatches": 412,
    "UserInfo": [ ... ]
  }
}
```

- `responseStatusStrg`: `MORE` (more pages), `OK` (this was the last page) or `NO MATCH` (nothing found).
- `numOfMatches`: records in this page.
- `totalMatches`: records in the whole result.

Loop while `responseStatusStrg` is `MORE`, adding the number of records you received to `searchResultPosition`. Also stop if a page comes back empty: some firmware says `MORE` with zero records, and a naive loop then asks for the same page forever.

A generic pager is in [`examples/lib/search.ts`](../examples/lib/search.ts).

## Time format

ISO 8601 with a UTC offset: `2026-11-16T09:30:00+05:00`. A few access-control fields (person validity `Valid.beginTime`/`endTime`) use local time without an offset, together with `"timeType": "local"`.
