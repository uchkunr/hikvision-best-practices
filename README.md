# Hikvision ISAPI best practices

A practical guide to integrating with Hikvision cameras, NVRs and access control terminals over ISAPI, their local HTTP API. It has documentation, runnable TypeScript examples, and a skill that gives Claude Code and Codex the same knowledge.

Checked against Hikvision's ISAPI developer guides and against open-source clients tested on real devices. Behaviour still differs between models and firmware versions, so each page says where to check your device's `capabilities`.

## Docs

| Page | What it covers |
| --- | --- |
| [Overview](docs/overview.md) | What ISAPI is, which API to use, resource tree, channel IDs |
| [Authentication](docs/authentication.md) | Digest auth, user levels, login lock, HTTPS with self-signed certificates |
| [Requests and responses](docs/requests.md) | JSON and XML, `ResponseStatus` and error codes, pagination, time format |
| [System and device](docs/system.md) | Device info, time and NTP, reboot, factory reset, accounts |
| [Persons](docs/access-control/persons.md) | Create, update, search and delete persons; sync pattern |
| [Cards](docs/access-control/cards.md) | Add, search and delete cards |
| [Faces](docs/access-control/faces.md) | Face library, multipart upload, picture requirements |
| [Doors](docs/access-control/doors.md) | Remote open, always open, door state |
| [Access events](docs/access-control/events.md) | Event search, major and minor codes |
| [Real-time events](docs/events.md) | alertStream (arming) and HTTP hosts (listening) |
| [Video and PTZ](docs/video.md) | Channels, snapshots, RTSP, PTZ |
| [Troubleshooting](docs/troubleshooting.md) | Symptoms, causes and fixes |

## Examples

TypeScript, no runtime dependencies. Node.js 22.18 or later runs the `.ts` files directly.

```bash
cd examples
cp .env.example .env    # set HIK_HOST, HIK_USER, HIK_PASS
node --env-file=.env device-info.ts
```

| Script | What it does |
| --- | --- |
| [`lib/client.ts`](examples/lib/client.ts) | Digest client with nonce reuse, lockout detection and `ResponseStatus` checks |
| [`lib/search.ts`](examples/lib/search.ts) | Pager for every ISAPI search endpoint |
| [`device-info.ts`](examples/device-info.ts) | Model, serial and firmware |
| [`list-persons.ts`](examples/list-persons.ts) | All persons on a terminal |
| [`create-person.ts`](examples/create-person.ts) | Create or update a person |
| [`delete-person.ts`](examples/delete-person.ts) | Delete a person |
| [`add-card.ts`](examples/add-card.ts) | Link a card to a person |
| [`upload-face.ts`](examples/upload-face.ts) | Upload a face photo |
| [`open-door.ts`](examples/open-door.ts) | Open, lock or release a door |
| [`access-events.ts`](examples/access-events.ts) | Access events from the last 24 hours |
| [`alert-stream.ts`](examples/alert-stream.ts) | Live events over alertStream, with reconnect |
| [`http-host-listener.ts`](examples/http-host-listener.ts) | Receive events the device pushes, and configure the device |
| [`snapshot.ts`](examples/snapshot.ts) | Save a JPEG from a camera channel |

## Skill for Claude Code and Codex

[`skills/hikvision-isapi`](skills/hikvision-isapi/SKILL.md) teaches an AI coding agent the rules from this guide: Digest and lockout handling, status codes, pagination, access-control payloads, event codes and the common firmware traps. It follows the [Agent Skills](https://agentskills.io) format.

**Claude Code**

```text
/plugin marketplace add uchkunr/hikvision-best-practices
/plugin install hikvision-isapi@hikvision-best-practices
```

**Codex**

```bash
codex plugin marketplace add uchkunr/hikvision-best-practices
codex plugin add hikvision-isapi@hikvision-best-practices
```

**Manual install.** Copy `skills/hikvision-isapi` to `~/.claude/skills/` (Claude Code) or `~/.agents/skills/` (Codex), or to `.claude/skills/` / `.agents/skills/` inside one project.

## License

- Documentation (`docs/`, this README): [CC BY 4.0](LICENSE). Share and adapt with attribution.
- Code (`examples/`, `skills/`) and code snippets in the docs: MIT ([examples](examples/LICENSE), [skills](skills/hikvision-isapi/LICENSE)).

Not affiliated with or endorsed by Hikvision. Hikvision is a trademark of Hangzhou Hikvision Digital Technology Co., Ltd.
