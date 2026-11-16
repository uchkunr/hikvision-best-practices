// Link a card number to an existing person.
//
//   node --env-file=.env add-card.ts 1001 0012345678

import { IsapiClient } from "./lib/client.ts";

const [employeeNo, cardNo] = process.argv.slice(2);
if (!employeeNo || !cardNo) throw new Error("Usage: add-card.ts <employeeNo> <cardNo>");

const client = IsapiClient.fromEnv();

await client.json("POST", "/ISAPI/AccessControl/CardInfo/Record", {
  CardInfo: { employeeNo, cardNo, cardType: "normalCard" },
});
console.log(`Card ${cardNo} -> ${employeeNo}`);
