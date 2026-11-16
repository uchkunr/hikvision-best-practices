# Persons (UserInfo)

On access terminals (DS-K1T face terminals, DS-K2 controllers, door stations), a person is the record that cards, faces and fingerprints attach to. Its key is `employeeNo`.

| Operation | Method | Endpoint |
| --- | --- | --- |
| Capabilities | GET | `/ISAPI/AccessControl/UserInfo/capabilities?format=json` |
| Count | GET | `/ISAPI/AccessControl/UserInfo/Count?format=json` |
| Search | POST | `/ISAPI/AccessControl/UserInfo/Search?format=json` |
| Create | POST | `/ISAPI/AccessControl/UserInfo/Record?format=json` |
| Modify | PUT | `/ISAPI/AccessControl/UserInfo/Modify?format=json` |
| Create or replace | PUT | `/ISAPI/AccessControl/UserInfo/SetUp?format=json` |
| Delete | PUT | `/ISAPI/AccessControl/UserInfo/Delete?format=json` |

Delete is `PUT`, not `DELETE`. This is how ISAPI does all access-control deletes.

## Create

```json
{
  "UserInfo": {
    "employeeNo": "1001",
    "name": "Aliyev Jasur",
    "userType": "normal",
    "Valid": {
      "enable": true,
      "beginTime": "2026-01-01T00:00:00",
      "endTime": "2036-12-31T23:59:59",
      "timeType": "local"
    },
    "doorRight": "1",
    "RightPlan": [{ "doorNo": 1, "planTemplateNo": "1" }]
  }
}
```

| Field | Notes |
| --- | --- |
| `employeeNo` | Required. String, up to 32 characters. Use your own system's ID |
| `name` | Shown on the terminal screen |
| `userType` | `normal`, `visitor` or `blackList` |
| `Valid` | When the person may enter. `timeType: "local"` means the times are device-local, without an offset |
| `doorRight` | Doors the person may open: `"1"`, or `"1,2"` |
| `RightPlan` | Schedule per door. Template `1` is "all day, every day" by default |
| `password` | Optional PIN for keypad terminals |
| `gender` | Optional: `male`, `female`, `unknown` |
| `maxTimes` | Optional entry limit. Leave it out unless you need it: older firmware rejects the whole record when it sees the field, and on newer firmware `0` can mean "no entries" |

Check `UserInfo/capabilities` for the fields and lengths your device accepts. Unknown or too-long fields fail the whole request with `statusCode` 6.

## Modify, SetUp and upserts

- `Modify` updates an existing person. Fields you leave out are kept.
- `SetUp` creates the person or replaces it entirely. Not every firmware has it.
- `Record` fails with `statusCode` 6 if the `employeeNo` exists.

A portable upsert is "try `Record`, and on code 6 call `Modify`". See [`examples/create-person.ts`](../../examples/create-person.ts).

Some firmware wants `PUT` where the guide says `POST` (or the other way round) and answers `methodNotAllowed`. If you support many models, retry once with the other method on that sub-code.

## Search

```json
{
  "UserInfoSearchCond": {
    "searchID": "sync-1",
    "searchResultPosition": 0,
    "maxResults": 30,
    "EmployeeNoList": [{ "employeeNo": "1001" }]
  }
}
```

Leave out `EmployeeNoList` to list everyone. The result is in `UserInfoSearch.UserInfo[]`. Pagination rules are in [Requests and responses](../requests.md#search-and-pagination).

Do not treat an empty or failed search as "person is absent" before deleting or re-creating anything. Only `responseStatusStrg: "NO MATCH"` means not found.

## Delete

```json
{ "UserInfoDelCond": { "EmployeeNoList": [{ "employeeNo": "1001" }] } }
```

Whether deleting a person also removes their cards and face differs by firmware. After a delete, check `CardInfo/Count` and `FDLib/Count` once on your model, and delete credentials explicitly if they remain. Some newer terminals also offer `PUT /ISAPI/AccessControl/UserInfoDetail/Delete?format=json` for bulk deletes with progress; check capabilities before relying on it.

## Sync pattern

To keep a terminal in line with your own database:

1. Page through `UserInfo/Search` and build a map of `employeeNo`s on the device.
2. `Record` the ones missing on the device, `Modify` the ones that changed, `Delete` the ones you no longer have.
3. Write in small batches and keep going on per-person errors. Log `subStatusCode` for each failure.
4. Attach cards and faces after the person exists.

Examples: [`list-persons.ts`](../../examples/list-persons.ts), [`create-person.ts`](../../examples/create-person.ts), [`delete-person.ts`](../../examples/delete-person.ts)
