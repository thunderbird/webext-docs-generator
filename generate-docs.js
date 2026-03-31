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

        let manifestNamespace = schema.data.find(e => e.namespace == "manifest");
        let otherNamespaces = schema.data.filter(e => e.namespace != "manifest");

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
        const manifestSchema = schema.find(e => e.namespace == "manifest");
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
        const manifestSchema = schema.find(e => e.namespace == "manifest");
        const namespaceSchema = schema.find(e => e.namespace == namespaceName);
        const parentNamespaceSchemas = namespaceName.split(".").slice(0, -1)
            .map((_, i, parts) => parts.slice(0, i + 1).join("."))
            .map(name => namespaces.get(name)?.find(e => e.namespace == name));

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
        })
        const doc = await writer.generateApiDoc();

        await fs.writeFile(
            path.join(config.output, `${namespaceName}.rst`),
            doc.toString(),
            "utf8"
        );
    }
}