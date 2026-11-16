# Doors

| Operation | Method | Endpoint |
| --- | --- | --- |
| Supported commands | GET | `/ISAPI/AccessControl/RemoteControl/door/capabilities` |
| Control a door | PUT | `/ISAPI/AccessControl/RemoteControl/door/{doorNo}` |
| Door and lock state | GET | `/ISAPI/AccessControl/AcsWorkStatus?format=json` |
| Door parameters | GET, PUT | `/ISAPI/AccessControl/Door/param/{doorNo}` |

## Control a door

```xml
<RemoteControlDoor>
  <cmd>open</cmd>
</RemoteControlDoor>
```

| `cmd` | Effect |
| --- | --- |
| `open` | Unlock once, for the configured open duration |
| `close` | Lock now |
| `alwaysOpen` | Stay unlocked until told otherwise |
| `alwaysClose` | Stay locked; valid credentials are refused |
| `resume` | Leave `alwaysOpen`/`alwaysClose` and return to the normal schedule |

- Send XML. It works on every firmware; JSON (`?format=json` with `{"RemoteControlDoor": {"cmd": "open"}}`) only on some.
- Not every model supports every command. Some face terminals omit `resume` or `alwaysClose`. Read `door/capabilities` (its `<cmd opt="...">` lists them) and `<doorNo min max>` for the valid door numbers.
- Check the `statusCode` in the reply. The device can answer HTTP 200 and still refuse the command.
- A remote open is logged as an access event under major `3` (operation), minor `1024` (`0x400`, remote open door). See [Access events](events.md).

## Door state

`AcsWorkStatus` reports, per door, the lock (`doorLockStatus`) and the door contact (`magneticStatus`) as lists. `doorLockStatus` `0` means locked. `magneticStatus` `1` means open. A terminal without a door contact wired reports a fixed value, so do not rely on it unless the sensor is installed.

Example: [`examples/open-door.ts`](../../examples/open-door.ts)
