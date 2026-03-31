/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Author: John Bieling
 */

import * as tools from './modules/tools.mjs';
import { Writer } from './modules/writer.mjs';

import { promises as fs } from "fs";
import path from "path";

const SBT = "`";
const TEMPLATE_PATH = `template`;
const HELP_SCREEN = `

Usage:

    node generate-docs.js <options>
    
Options:
   --schemas=path             - ...
                                ...
   --output=path              - Path of a folder to store the generated markdown
                                files. All existing files in that folder will be
                                deleted.
   --manifest_version         - ...
   --report_errors            - report errors in the schema files
`;

let ADDITIONAL_TYPE_PREFIXES = [];
const ADDITIONAL_TYPE_FILES = [
    "experiments.json",
    "extension_types.json",
    "manifest.json",
    "types.json",
    "events.json"
];

const TITLE_DATA = {
    "release": {
        prefix: "",
        slug: "",
    },
    "esr": {
        prefix: "ESR ",
        slug: "esr-",
    },
    "beta": {
        prefix: "Beta ",
        slug: "beta-",
    },
    "daily": {
        prefix: "Daily ",
        slug: "daily-",
    },    
}

const config = tools.parseArgs();
if (!config.schemas || !config.output || !config.manifest_version) {
    console.log(HELP_SCREEN);
} else {
    // Clone template folder and adjust cloned files.
    const schemas = await tools.getSchemaFiles(config.schemas);
    const thunderbird_version = schemas.map(a => a.data.map(e => e.applicationVersion).filter(Boolean)).flat().pop();
    config.thunderbird_channel = "release";
    if (thunderbird_version.includes("esr")) config.thunderbird_channel = "esr";
    if (thunderbird_version.includes("b")) config.thunderbird_channel = "beta";
    if (thunderbird_version.includes("a")) config.thunderbird_channel = "daily";
    const long_title = `WebExtension API Documentation for Thunderbird ${thunderbird_version}`;
    const title = `WebExtension API Documentation & Guides (Thunderbird ${TITLE_DATA[config.thunderbird_channel].prefix}${thunderbird_version.split(".")[0]}, Manifest V${config.manifest_version})`;
    const link = `https://webextension-api.thunderbird.net/en/${TITLE_DATA[config.thunderbird_channel].slug}mv${config.manifest_version}/`

    // Read fluent strings for permissions.
    let PERMISSION_LOCALES = await fs.readFile(path.join(config.schemas, `permissions.ftl`), "utf8");

    // Parent and Child implementations are in separate files and need to be
    // merged. Sub namespaces are in the same file and need to be separated.
    // Filter out global type definitions.
    const namespaces = new Map();
    const globalTypes = new Map();
    const relatedNamespaceNames = new Map();
    for (let schema of schemas) {
        if (ADDITIONAL_TYPE_FILES.includes(schema.file)) {
            let data = schema.data.find(e => e.types);
            ADDITIONAL_TYPE_PREFIXES.push(data.namespace);
            data.types.forEach(t => {
                globalTypes.set(`${data.namespace}.${t.id}`, t)
            });
            continue;
        }

        let manifestNamespace = schema.data.find(e => e.namespace === "manifest");
        let otherNamespaces = schema.data.filter(e => e.namespace !== "manifest");

        // Find APIs which do not have a path and therefore no API namespace. In
        // order to document those, we create a fake API namespace, following the
        // same camel case notation.
        if (!otherNamespaces.length && manifestNamespace?.types?.length) {
            otherNamespaces = manifestNamespace.types
                .filter(t => t.$extend === "WebExtensionManifest")
                .flatMap(t => Object.keys(t.properties))
                .map(snake => ({ namespace: tools.toCamelCase(snake) }));
        }

        for (let entry of otherNamespaces) {
            const name = entry.namespace;
            const namespace = tools.mergeSchema(namespaces.get(name) ?? [], entry, manifestNamespace);
            namespaces.set(name, namespace);
        }

        const names = relatedNamespaceNames.get(schema.file) || [];
        names.push(...otherNamespaces.map(e => e.namespace));
        relatedNamespaceNames.set(schema.file, names);
    }

    // Expand properties with "$ref": "types.Setting" into synthetic sub-namespaces.
    // The Setting type has functions (get, set, clear) and events (onChange), which
    // map naturally to the existing sub-namespace documentation model.
    const settingType = globalTypes.get("types.Setting");
    const settingSubNamespaces = new Map();
    if (settingType) {
        for (const [namespaceName, schema] of [...namespaces]) {
            const namespaceSchema = schema.find(e => e.namespace === namespaceName);
            if (!namespaceSchema?.properties) continue;

            const manifestSchema = schema.find(e => e.namespace === "manifest");
            const settingPropertyNames = [];

            for (const [propName, propDef] of Object.entries(namespaceSchema.properties)) {
                if (propDef["$ref"] !== "types.Setting") continue;
                settingPropertyNames.push(propName);

                const subNamespaceName = `${namespaceName}.${propName}`;
                const syntheticSchema = {
                    namespace: subNamespaceName,
                    functions: structuredClone(settingType.functions || []),
                    events: structuredClone(settingType.events || []),
                    description: propDef.description,
                    annotations: propDef.annotations,
                };

                const annotationProps = propDef.annotations
                    ?.find(a => a.additional_properties)?.additional_properties;
                if (annotationProps?.readOnly) {
                    syntheticSchema.functions = syntheticSchema.functions
                        .filter(f => f.name === "get");
                }

                const entry = [syntheticSchema];
                entry.push(manifestSchema || { namespace: "manifest" });
                namespaces.set(subNamespaceName, entry);

                for (const [file, names] of relatedNamespaceNames) {
                    if (names.includes(namespaceName)) {
                        names.push(subNamespaceName);
                        break;
                    }
                }

                if (!settingSubNamespaces.has(namespaceName)) {
                    settingSubNamespaces.set(namespaceName, []);
                }
                settingSubNamespaces.get(namespaceName).push({
                    name: subNamespaceName,
                    description: propDef.description,
                    readOnly: !!annotationProps?.readOnly,
                });
            }

            for (const propName of settingPropertyNames) {
                delete namespaceSchema.properties[propName];
            }
            if (Object.keys(namespaceSchema.properties).length === 0) {
                delete namespaceSchema.properties;
            }
        }
    }

    // Setting sub-namespaces are listed via toctree in their parent page,
    // not in the top-level API list.
    const settingNames = new Set([...settingSubNamespaces.values()].flat().map(s => s.name));
    const apiNames = [...namespaces.keys()].filter(n => !settingNames.has(n))

    await tools.copyFolder(TEMPLATE_PATH, config.output);
    await tools.processFiles(config.output, /\.rst$/i, true, content => {
        let rv = tools.evaluateConditionTag(content, config);
        rv = tools.indentHonoringReplace(rv, "{{API_LIST}}", apiNames.sort())
        rv = tools.indentHonoringReplace(rv, "{{TITLE}}", [
            "=".repeat(title.length),
            title,
            "=".repeat(title.length),
        ])
        // Convert $(ref:...) to :ref:`...` with escaped upper case letters.
        rv = rv.replace(/\$\(ref:(.*?)\)/g, (match, ref) =>
            `:ref:${SBT}${tools.escapeUppercase(ref)}${SBT}`
        )
        return rv;
    });

    await tools.processFiles(config.output, "conf.py", false, content => {
        let rv = tools.evaluateConditionTag(content, config);
        rv = rv.replace("{{TITLE}}", `${long_title}<br><br>Manifest V${config.manifest_version}`)
        return rv;
    });

    await tools.processFiles(config.output, "README.md", false, content => {
        return content
            .replace("{{TITLE}}", title)
            .replace("{{LINK}}", link);
    });

    // First loop over manifest schemas to extract extends and update the global
    // manifest schema.
    for (let [namespaceName, schema] of namespaces) {
        const manifestSchema = schema.find(e => e.namespace === "manifest");
        for (let localDefinition of (manifestSchema.types || [])) {
            let extend = localDefinition["$extend"];
            // We only care about extends here. There *are* manifests which also
            // add local types to the global manifest (Theme), but we use the local
            // manifest for the individual API generations.
            if (extend) {
                let globalDefinition = globalTypes.get(`manifest.${extend}`);
                globalDefinition = tools.mergeSchemaExtensions(globalDefinition, localDefinition);
                globalTypes.set(`manifest.${extend}`, globalDefinition);
            }
        }
    }

    for (let [namespaceName, schema] of namespaces) {
        const manifestSchema = schema.find(e => e.namespace === "manifest");
        const namespaceSchema = schema.find(e => e.namespace === namespaceName);
        const parentNamespaceSchemas = namespaceName.split(".").slice(0, -1)
            .map((_, i, parts) => parts.slice(0, i + 1).join("."))
            .map(name => namespaces.get(name)?.find(e => e.namespace === name));

        const writer = new Writer({
            config,
            namespaces,
            namespaceName,
            namespaceSchema,
            parentNamespaceSchemas,
            manifestSchema,
            globalTypes,
            PERMISSION_LOCALES,
            ADDITIONAL_TYPE_PREFIXES,
            RELATED_NAMESPACE_NAMES: [...relatedNamespaceNames.values()].find(e => e.includes(namespaceName)),
            SETTING_SUB_NAMESPACES: settingSubNamespaces.get(namespaceName) || [],
            IS_SETTING: settingNames.has(namespaceName),
            SETTING_NAMES: settingNames,
        })
        const doc = await writer.generateApiDoc();

        await fs.writeFile(
            path.join(config.output, `${namespaceName}.rst`),
            doc.toString(),
            "utf8"
        );
    }

    // Collect changelog data from version_added annotations.
    const changelog = new Map();
    const changelogResolveRef = (ref) => {
        const parts = ref.split(".");
        const namespace = parts.slice(0, -1).join(".");
        const anchor = tools.guessRefId(tools.escapeUppercase(ref));
        return `\`${ref} <../${namespace}.html#${anchor}>\`__`;
    };
    const formatChangelogDescription = str =>
        Writer.convertMarkupToRst(str, { resolveRef: changelogResolveRef })
            ?.replace(/\s+/g, " ")
            .trim()
        || "";

    const getVersion = node =>
        node?.annotations?.find(a => typeof a.version_added === "string")?.version_added;

    // Recursively collect version_added entries, skipping children that
    // share the same version as their parent.
    function scanNode(node, parentVersion, path, results) {
        const nodeVersion = getVersion(node);
        const effectiveVersion = nodeVersion || parentVersion;

        // Record this node if its version differs from parent and it has
        // a description. Entries without descriptions are skipped.
        if (nodeVersion && nodeVersion !== parentVersion && path.length > 0 && node.description) {
            results.push({
                version: nodeVersion,
                path: [...path],
                description: formatChangelogDescription(node.description),
            });
        }

        // Scan functions.
        for (const func of node.functions || []) {
            const funcPath = [...path, { type: "functions", name: func.name }];
            scanNode(func, effectiveVersion, funcPath, results);
            for (const param of func.parameters || []) {
                if (param.name === func.async) continue; // skip callback
                scanNode(param, getVersion(func) || effectiveVersion,
                    [...funcPath, { type: "parameters", name: param.name }], results);
                scanProperties(param, getVersion(param) || getVersion(func) || effectiveVersion, funcPath, param.name, results);
            }
        }

        // Scan events.
        for (const event of node.events || []) {
            const eventPath = [...path, { type: "events", name: event.name }];
            scanNode(event, effectiveVersion, eventPath, results);
            for (const param of event.parameters || []) {
                scanNode(param, getVersion(event) || effectiveVersion,
                    [...eventPath, { type: "parameters", name: param.name }], results);
                scanProperties(param, getVersion(param) || getVersion(event) || effectiveVersion, eventPath, param.name, results);
            }
        }

        // Scan types (including manifest types without $extend).
        const types = [...(node.types || [])];
        for (const type of types) {
            if (type.$extend) continue;
            const typePath = [...path, { type: "types", name: type.id || type.name }];
            scanNode(type, effectiveVersion, typePath, results);
            const typeVersion = getVersion(type) || effectiveVersion;
            scanProperties(type, typeVersion, typePath, null, results);
            scanEnums(type, typeVersion, typePath, results);
        }

        // Scan namespace-level properties.
        scanProperties(node, effectiveVersion, path, null, results);
    }

    function scanProperties(node, parentVersion, parentPath, paramName, results) {
        for (const [key, prop] of Object.entries(node.properties || {})) {
            const propPath = paramName
                ? [...parentPath, { type: "parameters", name: `${paramName}.${key}` }]
                : [...parentPath, { type: "properties", name: key }];
            scanNode(prop, parentVersion, propPath, results);
            // Recurse into nested object properties.
            if (prop.properties) {
                scanProperties(prop, getVersion(prop) || parentVersion, parentPath,
                    paramName ? `${paramName}.${key}` : key, results);
            }
            scanEnums(prop, getVersion(prop) || parentVersion, propPath, results);
        }
    }

    function scanEnums(node, parentVersion, parentPath, results) {
        if (node.enums) {
            for (const [enumName, enumDef] of Object.entries(node.enums)) {
                const enumVersion = getVersion(enumDef);
                if (enumVersion && enumVersion !== parentVersion && enumDef.description) {
                    results.push({
                        version: enumVersion,
                        path: [...parentPath, { type: "enums", name: enumName }],
                        description: formatChangelogDescription(enumDef.description),
                    });
                }
            }
        }
    }

    for (const [namespaceName, schema] of namespaces) {
        if (settingNames.has(namespaceName)) continue;

        const ns = schema.find(e => e.namespace === namespaceName);
        if (!ns) continue;

        const nsVersion = getVersion(ns);

        // Entire namespace is new.
        if (nsVersion) {
            if (!changelog.has(nsVersion)) changelog.set(nsVersion, []);
            changelog.get(nsVersion).push({
                namespace: namespaceName,
                description: formatChangelogDescription(ns.description || ""),
                isNew: true,
            });
        }

        // Scan all children recursively.
        const results = [];
        const manifestSchema = schema.find(e => e.namespace === "manifest");
        const manifestTypes = (manifestSchema?.types || []).filter(t => t.id && !t.$extend);
        const nsWithManifestTypes = { ...ns, types: [...(ns.types || []), ...manifestTypes] };
        scanNode(nsWithManifestTypes, nsVersion, [], results);

        // Group results by version and namespace, deduplicating by name.
        for (const result of results) {
            if (!changelog.has(result.version)) changelog.set(result.version, []);
            let group = changelog.get(result.version).find(g => g.namespace === namespaceName && !g.isNew);
            if (!group) {
                group = { namespace: namespaceName, isNew: false, newItems: [], seen: new Set() };
                changelog.get(result.version).push(group);
            }
            const topEntry = result.path[0];
            const name = result.path.map(p => p.name).join(".");
            if (group.seen.has(name)) continue;
            group.seen.add(name);
            group.newItems.push({
                section: topEntry.type,
                name,
                description: result.description,
            });
        }
    }

    // Determine minimum changelog version from the template placeholder.
    const indexContent = await fs.readFile(path.join(config.output, "index.rst"), "utf8");
    const minVersionMatch = indexContent.match(/\{\{CHANGELOG_LIST(?::(\d+))?\}\}/);
    const minChangelogVersion = minVersionMatch?.[1] ? parseInt(minVersionMatch[1], 10) : 0;

    // Generate changelog RST files (only for versions >= minimum).
    const changelogDir = path.join(config.output, "changelog");
    await fs.mkdir(changelogDir, { recursive: true });

    const sortedVersions = [...changelog.keys()]
        .filter(v => parseInt(v, 10) >= minChangelogVersion)
        .sort((a, b) => {
        // Sort versions numerically descending (newest first).
        const partsA = a.split(".").map(Number);
        const partsB = b.split(".").map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const diff = (partsB[i] || 0) - (partsA[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });

    for (const version of sortedVersions) {
        const entries = changelog.get(version);
        const title = `Changelog for Thunderbird ${version}`;
        const lines = [
            ".. role:: small",
            "",
            "=".repeat(title.length),
            title,
            "=".repeat(title.length),
            "",
            `The following WebExtension API changes were introduced in Thunderbird ${version}.`,
            "",
        ];

        const sectionLabels = {
            functions: "function",
            events: "event",
            types: "type",
            properties: "property",
        };
        const sectionOrder = ["functions", "events", "types", "properties"];

        const formatApiHeader = (namespaceName) => [
            "",
            ".. raw:: html",
            "",
            `   <div class="changelog-api-header">`,
            `     <span class="changelog-api-label">api</span>`,
            `     <a href="../${namespaceName}.html">${namespaceName}</a>`,
            `   </div>`,
            "",
        ];

        const sortedEntries = entries
            .filter(api => api.description || (api.newItems && api.newItems.length > 0))
            .sort((a, b) => a.namespace.localeCompare(b.namespace));
        for (const api of sortedEntries) {
            lines.push(...formatApiHeader(api.namespace));
            if (api.isNew) {
                if (api.description) {
                    lines.push(api.description, "");
                }
            } else {
                const sortedItems = api.newItems.sort((a, b) => {
                    const orderA = sectionOrder.indexOf(a.section);
                    const orderB = sectionOrder.indexOf(b.section);
                    if (orderA !== orderB) return orderA - orderB;
                    return a.name.localeCompare(b.name);
                });
                for (const item of sortedItems) {
                    const label = sectionLabels[item.section] || item.section;
                    const link = `../${api.namespace}.html#${tools.guessRefId(tools.escapeUppercase(`${api.namespace}.${item.name}`))}`;
                    if (item.description) {
                        lines.push(`- :small:\`${label}\` \`${item.name} <${link}>\`__ — ${item.description}`);
                    } else {
                        lines.push(`- :small:\`${label}\` \`${item.name} <${link}>\`__`);
                    }
                }
                lines.push("");
            }
        }

        await fs.writeFile(
            path.join(changelogDir, `${version}.rst`),
            lines.join("\n"),
            "utf8"
        );
    }

    // Replace {{CHANGELOG_LIST:minVersion}} in the output index.rst.
    // The minVersion parameter limits which changelog entries are included.
    await tools.processFiles(config.output, "index.rst", false, content => {
        return content.replace(
            /(\s*)\{\{CHANGELOG_LIST(?::(\d+))?\}\}/gm,
            (match, indent, minVersion) => {
                const min = minVersion ? parseInt(minVersion, 10) : 0;
                const filtered = sortedVersions.filter(v => parseInt(v, 10) >= min);
                return filtered
                    .map(v => `${indent}Thunderbird ${v} <changelog/${v}>`)
                    .join("\n");
            }
        );
    });
}