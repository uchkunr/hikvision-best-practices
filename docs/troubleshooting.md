# Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `401` on every request | Basic auth sent to a Digest-only device | Use Digest (`curl --digest`) |
| `401` after it worked before | Nonce expired | Take the new challenge and retry once |
| `401` with `<lockStatus>locked</lockStatus>` | Too many failed logins | Stop. Wait `unlockTime` seconds. Fix the password before retrying |
| `401` on one endpoint, `deviceInfo` works | Account lacks that permission | Use an admin account, or grant the permission (for example "Remote: Log Search" for events) |
| `401` on a brand-new device | Device not activated | Activate it and set the admin password first |
| `statusCode` 4, `notSupport` | Feature or format not on this model or firmware | Read the resource's `capabilities`; try XML instead of JSON |
| `statusCode` 4, `methodNotAllowed` | Wrong HTTP method | Try `PUT` instead of `POST`, or the other way round |
| `statusCode` 6, `badParameters` | A field is out of range, too long or unknown to this firmware | Compare with `capabilities`; remove optional fields one by one |
| `statusCode` 6 on create | The record already exists | `Modify` it instead |
| `statusCode` 5 | Body does not parse | Check JSON/XML syntax and `Content-Type` |
| JSON request returns XML | Endpoint is XML-only here | Use XML for this endpoint |
| HTTP 200, but nothing happened | Command refused in the body | Read `statusCode` in the reply |
| Event search returns nothing | Wrong time zone, device clock off, or the device needs `minor` | Send times with the device's offset, enable NTP, always send `minor` (`0` = all) |
| Search pages repeat forever | Device says `MORE` with zero records | Stop on an empty page |
| Face upload rejected | Picture too large, no clear face, or wrong part order | JPEG under 200 KB, one frontal face, metadata part first |
| Card taps not recognised | Card number format differs from the reader's | Tap the card, read `cardNo` from the "invalid card" event (minor 9), enrol that value |
| alertStream connects, then silence | Events not linked to "notify surveillance center", or the connection died | Enable the `center` linkage; reconnect when no heartbeat arrives |
| HTTP host gets no events | Device cannot reach your IP and port, or linkage missing | `POST .../httpHosts/{id}/test`; check the firewall; enable the `center` linkage |
| Non-Latin names garbled | Wrong encoding | Send UTF-8 and declare it in `Content-Type` |
| Requests time out under load | Too many parallel connections | Limit to a few concurrent requests per device; reuse keep-alive connections |

## Debugging checklist

1. `curl --digest -u admin:PASS http://DEVICE/ISAPI/System/deviceInfo`. If this fails, the problem is the network or the credentials, not your code.
2. Read the `capabilities` of the resource you are calling.
3. Make the same request in the device's web UI with the browser's network tab open, and copy what it sends. The web UI uses ISAPI too.
4. Log the full `ResponseStatus`, not only the HTTP status.
5. Note the model and `firmwareVersion` in every bug report. Behaviour differs between firmware versions of the same model.
