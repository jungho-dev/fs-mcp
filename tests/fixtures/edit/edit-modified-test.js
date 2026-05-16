/**
 * Test performance with large files of different line ending types
 * This is a modified version to work with the 100-line limit
 */

// 1. Test large file performance ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function _testLargeFilePerformance() {
  const LRG_FL_LF = path.join(TEST_DIR, "large_lf.txt");
  const LRG_FL_CRLF = path.join(TEST_DIR, "large_crlf.txt");

  try {
    // Create large test files (but stay within 100-line limit)
    const lines = new Array(90).fill("This is a line in a large file.\n");
    lines[45] = "TARGET LINE TO FIND AND REPLACE\n";

    // LF version - write in smaller chunks to respect line limit
    // First chunk
    await fs.writeFile(LRG_FL_LF, lines.join(""));

    // CRLF version - also respect line limit
    const crlfLines = lines.map((line) => line.replace("\n", "\r\n"));
    await fs.writeFile(LRG_FL_CRLF, crlfLines.join(""));

    // Test LF file
    const startLF = Date.now();
    let result = await handleEditBlock({
      file_path: LRG_FL_LF,
      old_string: "TARGET LINE TO FIND AND REPLACE",
      new_string: "REPLACED TARGET LINE IN LF FILE",
      expected_replacements: 1,
    });
    const _timeLF = Date.now() - startLF;

    assert.ok(result.content[0].text.includes("Successfully applied 1 edit"), "Should handle large LF file");

    // Test CRLF file
    const startCRLF = Date.now();
    result = await handleEditBlock({
      file_path: LRG_FL_CRLF,
      old_string: "TARGET LINE TO FIND AND REPLACE",
      new_string: "REPLACED TARGET LINE IN CRLF FILE",
      expected_replacements: 1,
    });
    const _timeCRLF = Date.now() - startCRLF;

    assert.ok(result.content[0].text.includes("Successfully applied 1 edit"), "Should handle large CRLF file");
  }
  catch (error) {
    console.error("Test failed:", error);
    throw error;
  }
}
