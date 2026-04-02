import { promises as fs } from "fs";
import path from "path";

export function evaluateConditionTag(content, config) {
  return content.replace(
    /\{\{CONDITION:(.+?):([\s\S]*?)\}\}/g,
    (match, conditionString, text) => {
      let conditions = conditionString.split(",");
      let include = true;
      conditionCheck: for (let condition of conditions) {
        let [key, value] = condition.split("=").map(s => s.trim());
        let values = value.split("|").map(v => v.trim());
        switch (key.toLowerCase()) {
          case "mv":
            if (!values.includes(config.manifest_version)) {
              include = false;
              break conditionCheck;
            }
            break;
          case "channel":
            if (!values.map(e => e.toLowerCase()).includes(config.thunderbird_channel)) {
              include = false;
              break conditionCheck;
            }
            break;
        }
      }
      return include ? text : ""
    }
  )
}

/**
 * Recursively process all files in a folder matching the given string or regex.
 * 
 * @param {string} folderPath - Path to the folder to process.
 * @param {RegExp|string} fileMatcher - Regex or literal string to match files.
 * @param {boolean} recursive - Dive into subfolders 
 * @param {Function} callback - A callback function which accepts the content
 *   of the file as a parameter, and returns the manipulated content.
 */
export async function processFiles(folderPath, fileMatcher, recursive, callback) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      if (recursive) await processFiles(fullPath, fileMatcher, recursive, callback);
    } else if (entry.isFile()) {
      const matches =
        typeof fileMatcher === 'string'
          ? entry.name === fileMatcher
          : fileMatcher instanceof RegExp && fileMatcher.test(entry.name);

      if (matches) {
        let content = await fs.readFile(fullPath, 'utf8');
        content = await callback(content, fullPath);
        await fs.writeFile(fullPath, content, 'utf8');
      }
    }
  }
}


/**
 * Simple helper function to parse command line arguments.
 *
 * @param {string[]} argv - Array of arguments (defaults to process.argv.slice(2))
 * @returns {object} command line arguments and their values
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (!value) {
        args[key] = true;
      } else {
        args[key] = value.toLowerCase();
      }
    }
  }
  return args;
}

/**
 * Reads all JSON files in a folder asynchronously.
 *
 * @param {string} folderPath - Path to the folder containing JSON files
 * @returns {Promise<Array<{file: string, data: any}>>} Array of file names and parsed JSON data
 */
export async function getSchemaFiles(folderPath) {
  try {
    // Read all file names in the folder
    const files = await fs.readdir(folderPath);

    // Filter only JSON files
    const jsonFiles = files.filter(file => file.endsWith(".json"));

    // Read and parse files asynchronously
    const results = await Promise.all(
      jsonFiles.map(async file => {
        const filePath = path.join(folderPath, file);
        const content = await fs.readFile(filePath, "utf-8");
        try {
          return {
            file,
            data: JSON.parse(content)
          };
        } catch (err) {
          throw new Error(`Failed to parse ${file}: ${err.message}`);
        }
      })
    );
    return results;
  } catch (err) {
    console.error("Error reading JSON files:", err);
    throw err;
  }
}

async function clearFolder(folderPath) {
  try {
    const stats = await fs.stat(folderPath);
    if (!stats.isDirectory()) {
      throw new Error(`${folderPath} exists but is not a directory`);
    }
    // Folder exists — clear its contents
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden files/folders
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Folder does not exist — create it
      await fs.mkdir(folderPath, { recursive: true });
    } else {
      throw err; // propagate other errors
    }
  }
}

/**
 * Recursively copies a folder to a destination, removing the destination first.
 *
 * @param {string} source - Source folder path
 * @param {string} destination - Destination folder path
 */
export async function copyFolder(source, destination) {
  const src = path.resolve(source);
  const dest = path.resolve(destination);

  // Clear destination folder.
  await clearFolder(dest);

  // Read source folder contents.
  const entries = await fs.readdir(src, { withFileTypes: true });

  // Copy each entry.
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        // Recursively copy subfolder.
        await copyFolder(srcPath, destPath);
      } else {
        // Copy file.
        await fs.copyFile(srcPath, destPath);
      }
    })
  );
}

/**
 * Indents each line of an array of strings by a given number of spaces.
 *
 * @param {string[]} lines - Lines to indent
 * @param {number} spaces - Number of spaces to prepend (default 2)
 * @returns {string[]} Indented lines
 */
export function indentLines(lines, spaces = 2) {
  const indent = " ".repeat(spaces);
  return lines.map(line => indent + line);
}

/**
 * Escapes special characters in a string for use in a RegExp.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function indentHonoringReplace(content, placeholder, lines) {
  const regex = new RegExp(`([ ]*)${escapeRegex(placeholder)}`, "gm");
  return content.replace(regex, (match, indent, offset, full) => {
    // build replacement: new lines, each with same indent
    const block = lines.map(l => `${indent}${l}`).join("\n");
    return block;
  });
}

const stableStringify = (obj) => {
  switch (getType(obj)) {
    case "primitive":
      return String(obj);
    case "array":
      return "[" + obj.map(stableStringify).join(",") + "]";
    case "object":
      return "{" + Object.keys(obj).sort()
        .map(k => JSON.stringify(k) + ":" + stableStringify(obj[k]))
        .join(",") + "}";
  }
}

const isEqual = (a, b) => {
  if (a === b) return true;
  return stableStringify(a) === stableStringify(b);
}

const getType = (v) => {
  if (v === null || typeof v !== "object") {
    return "primitive";
  }
  if (Array.isArray(v)) {
    return "array"
  }
  return "object"
}

/**
 * Merges a schema entry and a manifest into an existing entries array.
 *
 * @param {Array<object>} entries - Existing entries
 * @param {object} entry - Entry to merge
 * @param {object} manifest - Manifest to merge
 * @returns {Array<object>} Updated entries array
 */
export function mergeSchema(entries, entry, manifest) {
  const subMerge = (a, b) => { // b into a
    for (let entry of Object.keys(b)) {
      if (getType(b[entry]) === "primitive") {
        // Add/overwrite it (should not be different).
        a[entry] = b[entry];
        continue;
      }
      if (Array.isArray(b[entry]) && b[entry].length === 0) {
        continue;
      }
      if (Array.isArray(b[entry]) && b[entry].length > 0) {
        if (a[entry] === undefined || a[entry] === null) {
          // Just add it.
          a[entry] = b[entry];
          continue;
        }
        if (getType(b[entry][0]) === "primitive") {
          // Merge, but ensure uniqueness.
          a[entry] = [...new Set([...a[entry], ...b[entry]])];
          continue;
        }
        if (getType(b[entry][0]) === "object" && getType(a[entry]) === "array") {
          // Merge, but skip existing entries.
          a[entry].push(
            ...b[entry].filter(bItem =>
              !a[entry].some(aItem => isEqual(aItem, bItem))
            )
          );
          continue;
        }
      }
      // Unhandled entry type in schema merge.
    }
  }

  let existingEntry = entries.find(e => e.namespace === entry.namespace);
  if (existingEntry) {
    subMerge(existingEntry, entry);
  } else {
    entries.push(entry);
  }

  let existingManifest = entries.find(e => e.namespace === "manifest");
  if (existingManifest) {
    subMerge(existingManifest, manifest);
  } else {
    entries.push(manifest);
  }

  return entries;
}

/**
 * Merges src into dest.
 *
 * @param {object} dstObject - existing object
 * @param {object} srcObject - object to merge into the existing object
 */
export function mergeSchemaExtensions(dstObject, srcObject) {

  const mergeArray = (a, b) => { // b into a
    a.push(...b.filter(
      bItem => !a.some(aItem => isEqual(aItem, bItem))
    ));
  }

  function mergeChoice(a, b, type) {
    let bEntries = b.choices.filter(e => e[type]);
    for (let bEntry of bEntries) {
      let aEntries = a.choices.filter(e => e[type]);
      if (aEntries.length === 0) {
        a.choices.push(bEntry);
        continue;
      }

      // Try to merge into an identical one.
      let aEntry = aEntries.find(a => isEqual(a[type], bEntry[type]))
        || aEntries[0];

      switch (getType(bEntry)) {
        case "primitive":
          // skip, do not modify primitives
          break;
        case "array":
          mergeArray(aEntry, bEntry);
          break;
        case "object":
          mergeObject(aEntry, bEntry);
          break;
      }
    }
  }

  const mergeObject = (a, b) => { // b into a
    if (!a) {
      a = {}
    }

    for (let key of [...Object.keys(b)]) {
      if (key === "$extend") {
        continue;
      }

      if (Object.hasOwn(a, key)) {
        switch (getType(a[key])) {
          case "primitive":
            a[key] = b[key];
            break;
          case "array":
            if (key === "choices") {
              // choices need special handling
              mergeChoice(a, b, "enum");
              mergeChoice(a, b, "$ref");
            } else {
              // Add entries, but skip existing.
              mergeArray(a[key], b[key]);
            }
            break;
          case "object":
            mergeObject(a[key], b[key]);
            break;
        }
      } else {
        // Add.
        a[key] = b[key]
      }
    }
    return a;
  }

  return mergeObject(dstObject, srcObject);
}

// sphinx ignores uppercase letters, which can cause collisions if we have
// entries which only differ by the casing (for example types and properties)
export function escapeUppercase(str) {
  return str.replace(/[A-Z]/g, match => "^" + match.toLowerCase());
}

/**
 * Guess the HTML anchor (refid) Sphinx will generate for a label.
 * 
 * - Splits the label on any non-alphanumeric or underscore character.
 * - Removes empty entries.
 * - Joins remaining parts with a hyphen.
 * - Converts to lowercase.
 * 
 * @param {string} label - The RST label to normalize
 * @returns {string} The guessed HTML anchor ID
 */
export function guessRefId(label) {
  if (!label) return "";

  // Split on anything except letters, digits, or underscore
  let parts = label.split(/[^a-zA-Z0-9]+/);

  // Filter out empty strings
  parts = parts.filter(Boolean);

  // Join with "-" and convert to lowercase
  return parts.join('-').toLowerCase();
}


