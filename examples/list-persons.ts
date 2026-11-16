// List every person enrolled on an access terminal, page by page.
//
//   node --env-file=.env list-persons.ts

import { IsapiClient } from "./lib/client.ts";
import { searchAll } from "./lib/search.ts";

const client = IsapiClient.fromEnv();

const { UserInfoCount } = await client.json("GET", "/ISAPI/AccessControl/UserInfo/Count");
console.log(`Device reports ${UserInfoCount?.userNumber ?? "?"} persons`);

const persons = searchAll(client, {
  path: "/ISAPI/AccessControl/UserInfo/Search",
  condKey: "UserInfoSearchCond",
  resultKey: "UserInfoSearch",
  listKey: "UserInfo",
});

for await (const p of persons) {
  console.log(p.employeeNo, p.name, p.userType, p.Valid?.endTime ?? "");
}
