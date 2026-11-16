# Cards (CardInfo)

A card belongs to a person. Create the person first.

| Operation | Method | Endpoint |
| --- | --- | --- |
| Capabilities | GET | `/ISAPI/AccessControl/CardInfo/capabilities?format=json` |
| Count | GET | `/ISAPI/AccessControl/CardInfo/Count?format=json` (optional `&employeeNo=`) |
| Search | POST | `/ISAPI/AccessControl/CardInfo/Search?format=json` |
| Add | POST | `/ISAPI/AccessControl/CardInfo/Record?format=json` |
| Modify | PUT | `/ISAPI/AccessControl/CardInfo/Modify?format=json` |
| Delete | PUT | `/ISAPI/AccessControl/CardInfo/Delete?format=json` |

## Add

```json
{
  "CardInfo": {
    "employeeNo": "1001",
    "cardNo": "0012345678",
    "cardType": "normalCard"
  }
}
```

- `cardNo` is a string. Keep leading zeros. Use the same number format the reader produces (decimal is most common), or the card will not match.
- `cardType` is usually `normalCard`. Other types (duress, patrol, super card and so on) depend on the model; `CardInfo/capabilities` lists the ones yours accepts.
- How many cards one person may have depends on the model; see capabilities.

## Search

```json
{
  "CardInfoSearchCond": {
    "searchID": "cards-1",
    "searchResultPosition": 0,
    "maxResults": 30,
    "EmployeeNoList": [{ "employeeNo": "1001" }]
  }
}
```

Results are in `CardInfoSearch.CardInfo[]`. You can also filter with `CardNoList: [{ "cardNo": "..." }]`.

## Delete

By card number:

```json
{ "CardInfoDelCond": { "CardNoList": [{ "cardNo": "0012345678" }] } }
```

By person (all of their cards):

```json
{ "CardInfoDelCond": { "EmployeeNoList": [{ "employeeNo": "1001" }] } }
```

## Reading a card number at the terminal

To enrol a card by tapping it, read it from the access events: a tap of an unknown card produces an event with `cardNo` filled in and an "invalid card" minor code (`9`). See [Access events](events.md).

Example: [`examples/add-card.ts`](../../examples/add-card.ts)
