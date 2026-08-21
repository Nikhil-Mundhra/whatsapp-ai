import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/connections/[hash]/avatar/route.js";

describe("Avatar API Route (/api/connections/[hash]/avatar)", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.BLOB_READ_WRITE_TOKEN = originalEnv;
    } else {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    }
  });

  test("returns 400 when jid is missing", async () => {
    const req = new Request("http://localhost:3000/api/connections/TEST01/avatar");
    const res = await GET(req, { params: Promise.resolve({ hash: "TEST01" }) });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "hash and jid parameters required");
  });

  test("returns 404 when profile picture is not available from bridge", async () => {
    global.fetch = async (url) => {
      return new Response(JSON.stringify({ success: false, url: "" }), { status: 200 });
    };

    const req = new Request("http://localhost:3000/api/connections/TEST01/avatar?jid=919876543210%40s.whatsapp.net");
    const res = await GET(req, { params: Promise.resolve({ hash: "TEST01" }) });
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.error, "Profile picture not available");
  });

  test("streams low-res image buffer when WhatsApp CDN URL is returned", async () => {
    const mockImageBytes = Buffer.from("fake-jpeg-image-bytes-header");

    global.fetch = async (url) => {
      if (url.includes("/api/connections/")) {
        return new Response(
          JSON.stringify({ success: true, url: "https://pps.whatsapp.net/v/t24/mock-thumb.jpg" }),
          { status: 200 }
        );
      }
      if (url.includes("pps.whatsapp.net")) {
        return new Response(mockImageBytes, {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const req = new Request("http://localhost:3000/api/connections/TEST01/avatar?jid=919876543210%40s.whatsapp.net");
    const res = await GET(req, { params: Promise.resolve({ hash: "TEST01" }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "image/jpeg");
    assert.ok(res.headers.get("Cache-Control").includes("public, max-age="));
    const arrayBuffer = await res.arrayBuffer();
    assert.equal(Buffer.from(arrayBuffer).toString(), mockImageBytes.toString());
  });
});
