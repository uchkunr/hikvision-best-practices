// Create a person, or update it if the employeeNo already exists.
//
//   node --env-file=.env create-person.ts 1001 "Aliyev Jasur"

import { IsapiClient, IsapiError } from "./lib/client.ts";

const [employeeNo = "1001", name = "Test Person"] = process.argv.slice(2);
const client = IsapiClient.fromEnv();

const UserInfo = {
  employeeNo, // your system's stable ID, up to 32 characters
  name,
  userType: "normal", // "normal" | "visitor" | "blackList"
  Valid: {
    enable: true,
    beginTime: "2026-01-01T00:00:00",
    endTime: "2036-12-31T23:59:59",
    timeType: "local",
  },
  doorRight: "1", // doors this person may open, e.g. "1" or "1,2"
  RightPlan: [{ doorNo: 1, planTemplateNo: "1" }], // template 1 = all day, every day
};

try {
  await client.json("POST", "/ISAPI/AccessControl/UserInfo/Record", { UserInfo });
  console.log(`Created ${employeeNo}`);
} catch (err) {
  // A duplicate employeeNo is rejected with statusCode 6; update instead.
  if (!(err instanceof IsapiError) || err.statusCode !== 6) throw err;
  await client.json("PUT", "/ISAPI/AccessControl/UserInfo/Modify", { UserInfo });
  console.log(`Updated ${employeeNo} (${err.subStatusCode})`);
}
