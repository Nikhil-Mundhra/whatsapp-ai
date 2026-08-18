import test from "node:test";
import assert from "node:assert/strict";
import { getConfig, saveConfig } from "../lib/config.js";
import { _setKv } from "../lib/polls.js";

test("config.js unit tests", async (t) => {
  t.afterEach(() => {
    _setKv(null);
  });

  await t.test("getConfig returns null when kv is null", async () => {
    _setKv(null);
    const result = await getConfig();
    assert.equal(result, null);
  });

  await t.test("getConfig returns parsed object when kv returns string", async () => {
    const mockData = { ownerPhone: "+1234567890", allowedRecipients: ["+1987654321"] };
    _setKv({
      get: async (key) => {
        assert.equal(key, "config");
        return JSON.stringify(mockData);
      },
    });

    const result = await getConfig();
    assert.deepEqual(result, mockData);
  });

  await t.test("getConfig returns object when kv returns already parsed object", async () => {
    const mockData = { ownerPhone: "+1234567890" };
    _setKv({
      get: async () => mockData,
    });

    const result = await getConfig();
    assert.deepEqual(result, mockData);
  });

  await t.test("getConfig returns null when kv returns null/undefined", async () => {
    _setKv({
      get: async () => null,
    });

    const result = await getConfig();
    assert.equal(result, null);
  });

  await t.test("getConfig handles error gracefully when kv.get throws", async () => {
    _setKv({
      get: async () => {
        throw new Error("KV connection lost");
      },
    });

    const result = await getConfig();
    assert.equal(result, null);
  });

  await t.test("saveConfig returns config unchanged when kv is null", async () => {
    _setKv(null);
    const config = { ownerPhone: "+1234567890" };
    const result = await saveConfig(config);
    assert.deepEqual(result, config);
  });

  await t.test("saveConfig sets config in kv when kv is present", async () => {
    let savedKey = null;
    let savedValue = null;
    _setKv({
      set: async (key, val) => {
        savedKey = key;
        savedValue = val;
      },
    });

    const config = { ownerPhone: "+1234567890", aiApiKey: "secret-key" };
    const result = await saveConfig(config);
    assert.deepEqual(result, config);
    assert.equal(savedKey, "config");
    assert.equal(savedValue, JSON.stringify(config));
  });

  await t.test("saveConfig handles error gracefully when kv.set throws", async () => {
    _setKv({
      set: async () => {
        throw new Error("KV write failure");
      },
    });

    const config = { ownerPhone: "+1234567890" };
    const result = await saveConfig(config);
    assert.deepEqual(result, config);
  });
});
