/**
 * @file src/mcp/tools/catalog/edit-tools.mts
 * @description Editing tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {zodToJsonSchema} from "zod-to-json-schema";
import {EditBlockArgsSchema} from "@mcp/schemas/schema-exports";
import {CMD_PREFIX_DESCRIPTION, PATH_GUIDANCE, type ToolCatalogEntry} from "@mcp/tools/catalog/catalog-shared";

export const EDIT_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Editing tools
  {
    name: "edit_block",
    description: `
                Apply surgical edits to files.

                BEST PRACTICE: Make multiple small, focused edits rather than one large edit.
                Each edit_block call should change only what needs to be changed - include just enough
                context to uniquely identify the text being modified.

                TEXT FILES - Find/Replace mode:
                Takes:
                - file_path: Path to the file to edit
                - old_string: Text to replace
                - new_string: Replacement text
                - expected_replacements: Optional number of replacements (default: 1)

                DOCX FILES (.docx) - XML Find/Replace mode:
                Takes same parameters as text files (old_string, new_string, expected_replacements).
                Operates on the pretty-printed XML inside the DOCX — the same XML you see from
                read_file with offset/length. Copy XML fragments from read output as old_string.
                After editing, the XML is repacked into a valid DOCX.
                Also searches headers/footers if not found in document body.
                Examples:
                - Replace text: old_string="<w:t>Old Text</w:t>" new_string="<w:t>New Text</w:t>"
                - Change style: old_string='<w:pStyle w:val="Normal"/>' new_string='<w:pStyle w:val="Heading1"/>'
                - Add content: include surrounding XML context in old_string, add new elements in new_string

                By default, replaces only ONE occurrence of the search text.
                To replace multiple occurrences, provide expected_replacements with
                the exact number of matches expected.

                UNIQUENESS REQUIREMENT: When expected_replacements=1 (default), include the minimal
                amount of context necessary (typically 1-3 lines) before and after the change point,
                with exact whitespace and indentation.

                When editing multiple sections, make separate edit_block calls for each distinct change
                rather than one large replacement.

                When a close but non-exact match is found, a character-level diff is shown in the format:
                common_prefix{-removed-}{+added+}common_suffix to help you identify what's different.

                Similar to write_file, there is a configurable line limit (fileWriteLineLimit) that warns
                if the edited file exceeds this limit. If this happens, consider breaking your edits into
                smaller, more focused changes.

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(EditBlockArgsSchema),
    annotations: {
      title: "Edit Block",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
