# System and device

| Operation | Method | Endpoint | Notes |
| --- | --- | --- | --- |
| Device info | GET | `/ISAPI/System/deviceInfo` | Model, serial, MAC, firmware. XML on cameras and NVRs |
| Capabilities | GET | `/ISAPI/System/capabilities` | What the whole device supports |
| Status | GET | `/ISAPI/System/status` | CPU, memory, uptime |
| Time | GET, PUT | `/ISAPI/System/time` | Clock, time zone, `timeMode` (manual or NTP) |
| NTP servers | GET, PUT | `/ISAPI/System/time/ntpServers` | |
| Network | GET, PUT | `/ISAPI/System/Network/interfaces/{id}` | IP, mask, gateway, DNS. Changing it drops your connection |
| Reboot | PUT | `/ISAPI/System/reboot` | |
| Factory reset | PUT | `/ISAPI/System/factoryReset?mode=basic` | See below |
| Users | GET, POST | `/ISAPI/Security/users` | Device login accounts, not access-control persons |
| User | GET, PUT, DELETE | `/ISAPI/Security/users/{id}` | |
| Check login | GET | `/ISAPI/Security/userCheck` | Cheap credential test, see [Authentication](authentication.md) |
| Login lock | GET, PUT | `/ISAPI/Security/illegalLoginLock` | Failed attempts before lock (3 to 20) |
| Log search | POST | `/ISAPI/ContentMgmt/logSearch` | Operation and alarm logs, XML |

## Device info

```bash
curl --digest -u admin:PASSWORD http://192.168.1.64/ISAPI/System/deviceInfo
```

```xml
<DeviceInfo version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <deviceName>Entrance</deviceName>
  <model>DS-K1T343MWX</model>
  <serialNumber>DS-K1T343MWX20260101V030800ENA12345678</serialNumber>
  <macAddress>44:a6:42:00:00:01</macAddress>
  <firmwareVersion>V3.8.0</firmwareVersion>
  <firmwareReleasedDate>build 260101</firmwareReleasedDate>
  <deviceType>ACS</deviceType>
</DeviceInfo>
```

Store `serialNumber` as the device's identity. IP addresses change; serial numbers do not.

## Factory reset modes

`mode` is `full` (the default: everything, including network and users), `basic` (everything except network and user settings) or `part` (only some settings). Use `basic` when you still need to reach the device afterwards. A `full` reset makes the device inactive again.

## Time

Event searches and person validity are judged by the device clock, so keep it right:

```xml
<!-- PUT /ISAPI/System/time -->
<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <timeMode>NTP</timeMode>
  <timeZone>CST-5:00:00</timeZone>
</Time>
```

`timeZone` uses the POSIX sign convention: `CST-5:00:00` means UTC+5. The sign is the opposite of ISO 8601. Read the current value with `GET` first and copy its format.

Example: [`examples/device-info.ts`](../examples/device-info.ts)
