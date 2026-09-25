const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeFilename } = require("../lib");

test("replaces Windows-illegal filename characters", () => {
  // < > : " / \ | ? * are all illegal in Windows filenames, and this whole
  // project runs on Windows, so this is the platform that actually matters.
  assert.equal(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j'), "a_b_c_d_e_f_g_h_i_j");
});

test("leaves normal titles unchanged", () => {
  assert.equal(sanitizeFilename("No Future - 01 - 01"), "No Future - 01 - 01");
});

test("trims leading and trailing whitespace", () => {
  assert.equal(sanitizeFilename("  Episode Title  "), "Episode Title");
});

test("replaces control characters with underscores", () => {
  assert.equal(sanitizeFilename("title\x00with\x1Fcontrol"), "title_with_control");
});
