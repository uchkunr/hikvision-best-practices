// Print model, serial and firmware. Use it as a first connectivity check.
//
//   node --env-file=.env device-info.ts

import { IsapiClient } from "./lib/client.ts";

const client = IsapiClient.fromEnv();

// deviceInfo is XML on cameras and NVRs; access terminals also accept ?format=json.
const xml = await client.xml("GET", "/ISAPI/System/deviceInfo");
const field = (name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

console.log({
  deviceName: field("deviceName"),
  model: field("model"),
  serialNumber: field("serialNumber"),
  macAddress: field("macAddress"),
  firmwareVersion: field("firmwareVersion"),
  firmwareReleasedDate: field("firmwareReleasedDate"),
  deviceType: field("deviceType"),
});
