// Delete a person by employeeNo.
//
//   node --env-file=.env delete-person.ts 1001

import { IsapiClient } from "./lib/client.ts";

const [employeeNo] = process.argv.slice(2);
if (!employeeNo) throw new Error("Usage: delete-person.ts <employeeNo>");

const client = IsapiClient.fromEnv();

await client.json("PUT", "/ISAPI/AccessControl/UserInfo/Delete", {
  UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] },
});
console.log(`Deleted ${employeeNo}`);
