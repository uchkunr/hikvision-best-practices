// Upload a face photo for an existing person.
//
//   node --env-file=.env upload-face.ts 1001 ./face.jpg
//
// JPEG with one frontal face; keep it under 200 KB. The exact limits are in
// GET /ISAPI/Intelligent/FDLib/capabilities?format=json.

import { readFile } from "node:fs/promises";
import { IsapiClient } from "./lib/client.ts";

const [employeeNo, file] = process.argv.slice(2);
if (!employeeNo || !file) throw new Error("Usage: upload-face.ts <employeeNo> <face.jpg>");

// The image part name differs between Hikvision samples ("img" or "FaceImage").
// If the device rejects the upload, set HIK_FACE_PART=FaceImage.
const imagePart = process.env.HIK_FACE_PART ?? "img";

const client = IsapiClient.fromEnv();
const jpeg = await readFile(file);

// Part 1 is the JSON metadata; FPID ties the face to the person's employeeNo.
// Part 2 is the JPEG. The order matters.
const form = new FormData();
form.append("FaceDataRecord", JSON.stringify({ faceLibType: "blackFD", FDID: "1", FPID: employeeNo }));
form.append(imagePart, new Blob([jpeg], { type: "image/jpeg" }), "face.jpg");

const res = await client.fetch("/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json", {
  method: "POST",
  body: form, // fetch writes the multipart boundary
});
const body = await res.json();
if (body.statusCode !== 1) {
  throw new Error(`Upload failed: ${body.subStatusCode} ${body.errorMsg ?? ""}`);
}
console.log(`Face uploaded for ${employeeNo}`);
