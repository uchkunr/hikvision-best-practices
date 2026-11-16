# Faces (FDLib)

Face pictures live in a face picture library (FDLib). On access terminals the person's face goes into the library with `faceLibType: "blackFD"` and `FDID: "1"`, and `FPID` is set to the person's `employeeNo`. The person must exist first.

| Operation | Method | Endpoint |
| --- | --- | --- |
| Capabilities | GET | `/ISAPI/Intelligent/FDLib/capabilities?format=json` |
| List libraries | GET | `/ISAPI/Intelligent/FDLib?format=json` |
| Count faces | GET | `/ISAPI/Intelligent/FDLib/Count?format=json&FDID=1&faceLibType=blackFD` |
| Add face | POST | `/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json` |
| Add or replace face | PUT | `/ISAPI/Intelligent/FDLib/FDSetUp?format=json` |
| Search faces | POST | `/ISAPI/Intelligent/FDLib/FDSearch?format=json` |
| Delete faces | PUT | `/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD` |

## Add a face

The request is `multipart/form-data` with two parts, in this order:

1. `FaceDataRecord`: JSON metadata
   ```json
   { "faceLibType": "blackFD", "FDID": "1", "FPID": "1001" }
   ```
2. The JPEG image, with `Content-Type: image/jpeg`. Hikvision samples name this part `img` or `FaceImage` depending on the document. Most terminals accept either; if yours rejects one, try the other.

With `fetch` and `FormData` the boundary is handled for you:

```ts
const form = new FormData();
form.append("FaceDataRecord", JSON.stringify({ faceLibType: "blackFD", FDID: "1", FPID: employeeNo }));
form.append("img", new Blob([jpeg], { type: "image/jpeg" }), "face.jpg");

await client.fetch("/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json", { method: "POST", body: form });
```

If you build the body by hand, measure lengths in bytes (`Buffer.byteLength`), not string characters, or non-ASCII names break the request.

Instead of uploading bytes, you can send JSON with `"faceURL": "http://..."`, and the device downloads the picture itself. The device must be able to reach that URL.

If the person already has a face, the upload can fail. Delete the old face first, or use `PUT FDSetUp` (add or replace) on firmware that has it.

## Picture requirements

The exact limits are in `FDLib/capabilities`. For face terminals, plan for:

- JPEG with exactly one face, looking at the camera, evenly lit
- File size up to 200 KB
- A face that fills a good part of the frame; tiny faces in a large photo fail

If the upload is rejected for quality, the device could not build a face template from the picture. Retake or re-crop it; retrying the same file will not help.

## Search and delete

Search:

```json
{
  "searchResultPosition": 0,
  "maxResults": 30,
  "faceLibType": "blackFD",
  "FDID": "1",
  "FPID": "1001"
}
```

Delete (`FDID` and `faceLibType` in the query string):

```json
{ "FPID": [{ "value": "1001" }] }
```

Example: [`examples/upload-face.ts`](../../examples/upload-face.ts)
