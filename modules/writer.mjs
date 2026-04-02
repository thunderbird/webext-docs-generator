import { AdvancedArray, LevelState } from "./classes.mjs";
import * as tools from "./tools.mjs"
import * as strings from "./strings.mjs";

const DBT = "``";
const SBT = "`";

export class Writer {
    #options;

    constructor(options) {
        this.#options = options;
        this.sidebar = new Map();
        this.foundPermissions = new Set();
        this.foundTypes = new Set();
        this.version_added_tracker = new LevelState()
    }

    get config() {
        return this.#options.config;
    }
    get namespaceName() {
        return this.#options.namespaceName;
    }
    get namespaceSchema() {
        return this.#options.namespaceSchema;
    }
    get parentNamespaceSchemas() {
        return this.#options.parentNamespaceSchemas;
    }
    get manifestSchema() {
        return this.#options.manifestSchema;
    }
    get SCHEMAS() {
        return this.#options.namespaces;
    }
    get TYPES() {
        return this.#options.globalTypes;
    }
    get NAMESPACE_NAMES() {
        return [...this.SCHEMAS.keys()]
    }
    get RELATED_NAMESPACE_NAMES() {
        return this.#options.RELATED_NAMESPACE_NAMES;
    }
    get PERMISSION_LOCALES() {
        return this.#options.PERMISSION_LOCALES;
    }
    get ADDITIONAL_TYPE_PREFIXES() {
        return this.#options.ADDITIONAL_TYPE_PREFIXES;
    }
    get SETTING_SUB_NAMESPACES() {
        return this.#options.SETTING_SUB_NAMESPACES;
    }
    get IS_SETTING() {
        return this.#options.IS_SETTING;
    }
    get SETTING_NAMES() {
        return this.#options.SETTING_NAMES;
    }

    reportFixMeIfTriggered(value, ...info) {
        if (value && this.config.report_errors) {
            console.log(" - FIXME:", ...info);
        }
        return value;
    }

    api_member({ name = null, type = null, annotation = null, description = [], refId = null, refName = null, depth = 0 } = {}) {
        const lines = [
            ...this.reference(refId),
            "",
            ".. api-member::",
        ];

        if (name) {
            lines.push("   :name: " + name);
        }
        if (refId) {
            lines.push("   :refid: " + tools.guessRefId(tools.escapeUppercase(refId)));
        }
        if (refName) {
            lines.push("   :refname: " + refName);
        }
        if (type) {
            lines.push("   :type: " + type);
        }
        if (annotation) {
            lines.push("   :annotation: " + annotation);
        }
        if (depth) {
            lines.push("   :depth: " + depth);
        }
        if (description && description.length > 0) {
            lines.push("");
            for (const line of description) {
                lines.push("   " + line);
            }
        }

        return lines;
    }

    api_header(label, content = [], annotation = null) {
        const lines = [
            "",
            ".. api-header::",
            `   :label: ${label}`
        ];

        if (annotation) {
            lines.push(`   :annotation: ${annotation}`);
        }

        lines.push("");

        if (content.length > 0) {
            for (const line of content) {
                lines.push("   " + line);
            }
            lines.push("");
        }

        return lines;
    }

    format_page_title(string) {
        return [
            "",
            "=".repeat(string.length),
            string,
            "=".repeat(string.length),
            "",
        ];
    }

    format_section_heading(title, classnames = "api-main-section") {
        return [
            "",
            `.. rst-class:: ${classnames}`,
            "",
            title,
            "=".repeat(title.length),
            "",
        ];
    }

    format_entry_heading(text, { label = null, info = "" } = {}) {
        // The api-section-annotation-hack directive attaches the annotation
        // to the preceding section header, closes standard section div and opens api-section-body div
        return [
            ...this.reference(label),
            text,
            "-".repeat(text.length),
            "",
            `.. api-section-annotation-hack:: ${info}`,
            ""
        ];
    }

    format_setting_heading(name, { docRef, access = "write", addition = "" } = {}) {
        // Renders a self-contained property-style header bar that links to the
        // setting's own page. Uses raw HTML to avoid creating RST sections
        // (which would add toctree entries). Opens an api-section-body for the
        // description; must be paired with format_setting_footer() to close it.
        // Note: Uses <section> to mimic Sphinx's heading structure (see also
        // apisectionannotationhack.py). If the theme changes its section
        // elements, this must be updated to match (see also theme_overrides.css).
        return [
            "",
            ".. raw:: html",
            "",
            `   <section class="setting-prop-header-section ${access}">`,
            `   <div class="setting-prop-header">`,
            `     <span class="setting-prop-label">${access}</span>`,
            `     <a href="${docRef}.html">${name}</a>`,
            `   </div>`,
            "",
            `.. api-section-annotation-hack:: ${addition}`,
            "",
        ];
    }

    format_setting_footer() {
        // Closes the <section class="api-section-body"> opened by
        // format_setting_heading. See comment there about Sphinx theme
        // dependency on <section> elements.
        return [
            "",
            ".. raw:: html",
            "",
            "   </section>",
            "",
        ];
    }

    format_params(func, { callback = null } = {}) {
        const params = [];

        for (const param of func.parameters ?? []) {
            if (param.name === callback) {
                continue;
            }
            if (param.optional) {
                params.push(`[${param.name}]`);
            } else {
                params.push(param.name);
            }
        }

        return params.join(", ");
    }

    format_addition(obj, depth) {
        const { version_added } = obj?.annotations?.find(a => "version_added" in a) ?? {};
        if (
            version_added &&
            typeof version_added === 'string' &&
            this.version_added_tracker.isDifferentFromParent(depth, version_added)
        ) {
            return `-- [Added in TB ${version_added}]`;
        }
        return "";
    }

    format_object(name, obj, { print_description_only = false, print_enum_only = false, enumChanges = null, refId = null, depth = 0 } = {}) {
        // If we have received an enumChanges object and the obj does not already have one
        if (!obj.enumChanges && enumChanges !== null) {
            obj.enumChanges = enumChanges;
        }

        const parts = this.get_api_member_parts(name, obj, refId);

        // enum_only: fake header + enum
        // description_only: fake header + description + enum + nested
        // default: standard header + description + enum + nested

        const fakeHeader = [];
        const content = [];
        const lines = [];

        let indent;
        if (print_enum_only || print_description_only) {
            // fake api-member div structure, so style sheets continue to work
            indent = "      ";
            fakeHeader.push(
                "",
                ".. container:: api-member-node",
                "",
                "   .. container:: api-member-description-only"
            );
        } else {
            indent = "   ";
            content.push(...this.api_member({
                name: parts.name,
                type: `${parts.type}${parts.type_annotation}`,
                annotation: parts.annotation,
                refId,
                refName: parts.refName,
                depth,
            }));
        }

        const list_properties = (obj, depth) => {
            let propertyList = [];
            if (obj.type === "object" && obj.properties) {
                const entries = Object.entries(obj.properties).sort(([a], [b]) => a.localeCompare(b));

                // Required properties first
                for (const [key, value] of entries) {
                    if (value.ignore) continue;
                    if (!value.optional) {
                        propertyList.push(...this.format_object(key, value, {
                            refId: refId ? `${refId}.${key}` : null,
                            depth,
                        }));
                    }
                }

                // Optional properties next
                for (const [key, value] of entries) {
                    if (value.ignore) continue;
                    if (value.optional) {
                        propertyList.push(...this.format_object(key, value, {
                            refId: refId ? `${refId}.${key}` : null,
                            depth,
                        }));
                    }
                }
            }
            return propertyList;
        }

        if (print_enum_only) {
            content.push(...parts.enum.map(sub => `${indent}${sub}`));
        } else {
            content.push(...parts.description.map(sub => `${indent}${sub}`));
            content.push(...parts.enum.map(sub => `${indent}${sub}`));
            
            if (obj.type === "object" && obj.properties) {
                content.push(...list_properties(obj).map(sub => `${indent}${sub}`));
            } else if (obj.choices?.length > 1 && obj.choices.some(c => c.type === "object" && c.properties)) {
                // We cannot nest multiple api_members (the custom python class
                // would get very complicated). Instead, we attach a depth property,
                // so CSS can be used for the visual indentation.
                for (let i=0; i < obj.choices.length; i++) {
                    const nestedObj = obj.choices[i];
                    let nested_parts = this.get_api_member_parts(nestedObj.name, nestedObj, refId ? `${refId}.${obj.name}` : null);
                    content.push(...this.api_member({
                        type: `${i > 0 ? "or " : ""}(${this.get_type(nestedObj, nestedObj.name)})${nested_parts.type_annotation}`,
                        //annotation: nested_parts.annotation,
                        description: nested_parts.description,
                        depth: depth + 1,
                    }));
                    if (nestedObj.type === "object" && nestedObj.properties) {
                        content.push(...list_properties(nestedObj, depth + 2).map(sub => `${sub}`));
                    }
                }
            }
        }

        if (content.length > 0) {
            lines.push(...fakeHeader);
            lines.push(...content);
            lines.push("");
        }

        return lines;
    }

    async format_manifest_permissions() {
        const section = new AdvancedArray();

        for (let namespaceSchema of [...this.parentNamespaceSchemas, this.namespaceSchema]) {
            const entries = {
                manifest: {
                    single: "A manifest entry named %s is required to use ``messenger.%s.*``.",
                    multiple: "One of the manifest entries %s or %s is required to use ``messenger.%s.*``.",
                    entries: [],
                },
                permissions: {
                    single: "The permission %s is required to use ``messenger.%s.*``.",
                    multiple: "One of the permissions %s or %s is required to use ``messenger.%s.*``.",
                    entries: [],
                },
            };

            // Read globally required permissions first.
            if (namespaceSchema?.permissions) {
                const permissions = Array.from(new Set(namespaceSchema.permissions)).sort();
                for (const permission of permissions) {
                    if (!permission.startsWith("manifest:")) {
                        this.foundPermissions.add(permission);
                        entries.permissions.entries.push(`:permission:${SBT}${permission}${SBT}`);
                    } else {
                        // Only require manifestEntries which actually exists!
                        // The way action and browserAction are derived from each
                        // other requires both APIs to list both manifest entries...
                        const manifestEntry = permission.slice(9);
                        const manifestEntryExists = this.manifestSchema.types?.some(m => m.properties?.[manifestEntry]);
                        if (manifestEntryExists) { 
                            entries.manifest.entries.push(`:value:${SBT}${manifestEntry}${SBT}`);
                        }
                    }
                }
            }

            for (const entrytype of ["manifest", "permissions"]) {
                const entry = entries[entrytype];
                let text = "";
                if (entry.entries.length === 0) continue;
                else if (entry.entries.length === 1) {
                    text = entry.single.replace("%s", entry.entries[0]).replace("%s", this.namespaceName);
                } else {
                    const last = entry.entries.pop();
                    text = entry.multiple
                        .replace("%s", entry.entries.join(", "))
                        .replace("%s", last)
                        .replace("%s", this.namespaceName);
                }

                section.append([
                    "",
                    ".. rst-class:: api-permission-info",
                    "",
                    ".. note::",
                    "",
                    "   " + text,
                    ""
                ]);
            }
        }

        return section;
    }

    format_required_permissions(obj) {
        // Merge globally required permissions and object-specific permissions
        const allPermissions = [
            ...this.parentNamespaceSchemas.flatMap(s => s?.permissions || []),
            ...(this.namespaceSchema?.permissions || []),
            ...(obj?.permissions || []),
        ];

        const entries = [];
        for (const permission of Array.from(new Set(allPermissions)).sort()) {
            if (!permission.startsWith("manifest:")) {
                this.foundPermissions.add(permission);
                entries.push(`- :permission:${SBT}${permission}${SBT}`);
            }
        }

        const permissions = new AdvancedArray();
        if (entries.length > 0) {
            permissions.append(this.api_header("Required permissions", entries));
        }
        return permissions;
    }

    format_enum(name, value, refId) {
        if (value.enum == null) {
            if (value.items != null) {
                return this.format_enum(name, value.items);
            }
            return [];
        }

        let schema_annotations = value.enums ?? {};

        const enum_lines = [""];
        if (value.enum.length === 0) {
            enum_lines.push("No supported values.");
        } else {
            enum_lines.push("Supported values:");
            for (const enum_value of value.enum.sort()) {
                let enum_annotation = null;
                let enum_description = null;

                if (schema_annotations?.[enum_value]) {
                    enum_annotation = this.format_addition(schema_annotations[enum_value], 3);
                    enum_description = this.format_description(schema_annotations[enum_value]);
                }
                enum_lines.push(...this.api_member({
                    name: `:value:${SBT}${enum_value}${SBT}`,
                    annotation: enum_annotation,
                    description: enum_description,
                    refId: refId ? `${refId}.${enum_value}` : null,
                    refName: enum_value,
                }));
            }
        }

        return enum_lines;
    }

    format_type(typeDef) {
        const section = new AdvancedArray();
        section.append(this.format_entry_heading(
            typeDef.id,
            {
                label: `${this.namespaceName}.${typeDef.id}`,
                info: this.format_addition(typeDef, 1)
            }
        ));

        section.append(this.format_description(typeDef));

        if ("type" in typeDef) {
            if (
                typeDef.type === "object" &&
                !("isInstanceOf" in typeDef) &&
                ("properties" in typeDef || "functions" in typeDef)
            ) {
                let content = new AdvancedArray();

                if ("properties" in typeDef) {
                    const items = Object.entries(typeDef.properties).sort(([a], [b]) =>
                        a.localeCompare(b)
                    );

                    for (const [key, value] of items) {
                        if (!value.optional) {
                            content.append(this.format_object(key, value, {
                                refId: `${this.namespaceName}.${typeDef.id}.${key}`
                            }));
                        }
                    }

                    for (const [key, value] of items) {
                        if (value.optional) {
                            content.append(this.format_object(key, value, {
                                refId: `${this.namespaceName}.${typeDef.id}.${key}`
                            }));
                        }
                    }
                }

                section.append(this.api_header("object", content));
            } else {
                section.append(this.api_header(
                    this.get_type(typeDef, typeDef.id),
                    this.format_object(null, typeDef, {
                        print_enum_only: true,
                        refId: `${this.namespaceName}.${typeDef.id}`
                    })
                ));
            }
        } else if ("choices" in typeDef) {
            let first = true;
            for (const choice of typeDef.choices) {
                if (!first) {
                    section.push("", "*or*", "");
                }
                first = false;
                section.append(this.api_header(
                    this.get_type(choice, typeDef.id),
                    this.format_object(null, choice, {
                        print_description_only: true,
                        enumChanges: typeDef.enumChanges,
                        refId: `${this.namespaceName}.${typeDef.id}`
                    }))
                );
            }
        }

        section.append("");
        return section;
    }

    format_description(obj) {
        const section = new AdvancedArray();
        if ("description" in obj) {
            // Descriptions may still contain <li> tags, which are transformed
            // into markdown bullet points and line breaks. Eventually, those
            // should be replaced by annotations.
            const desc = this.replace_code(obj.description.trim()).split("\n");
            section.append("");
            section.append(desc);
            section.append("");
        }
        for (let annotation of obj.annotations ?? []) {
            if (Object.hasOwn(annotation, "text")) {
                section.append("");
                section.append(this.replace_code(annotation.text.trim()));
                section.append("");
            }
            if (Object.hasOwn(annotation, "code")) {
                section.append([
                    "",
                    `.. code-block:: ${annotation.type ?? ""}`,
                    "",
                    ...annotation.code.map(e => `   ${e}`),
                    "",
                ])
            }
            if (Object.hasOwn(annotation, "list")) {
                section.append("");
                section.append(annotation.list.map(e => ` * ${this.replace_code(e)}`))
                section.append("");
            }
            for (let box of ["note", "hint", "warning"]) {
                if (Object.hasOwn(annotation, box)) {
                    section.append([
                        "",
                        `.. ${box}::`,
                        "",
                        `   ${this.replace_code(annotation[box].trim())}`,
                        "",
                    ])
                }
            }
        }

        return section;
    }

    /**
     * Convert HTML markup in schema descriptions to RST. The static version
     * accepts callbacks for instance-specific operations (ref resolution and
     * permission tracking). Can be called from outside the Writer class.
     */
    static convertMarkupToRst(str, { resolveRef = null, trackPermission = null } = {}) {
        if (!str) {
            return str;
        }

        // Remove <code> inside <a>, as it is not render-able.
        str = str.replace(
            /(<a .*?>)<code>(.*?)<\/code>(.*?<\/a>)/g,
            '$1$2$3'
        );

        const replacements = {
            "<strong>": "**",
            "</strong>": "**",
            "<em>": "*",
            "</em>": "*",
            "<b>": "**",
            "</b>": "**",
            "<code>": ":code:`",
            "</code>": "`",
            // Work around sphinx bug ignoring roles if they start with spaces,
            // by prefixing a zero-width space.
            "<var> ": ":value:`\u200B ",
            "<val> ": ":value:`\u200B ",
            "<var>": ":value:`",
            "<val>": ":value:`",
            "</var>": "`",
            "</val>": "`",
            "&mdash;": "—",
            // Some tags just have to go.
            "<p>": "",
            "</p>": "",
            "<ul>": "",
            "</ul>": "",
            "<ol>": "",
            "</ol>": "",
            "</li>": "",
            // The input data is read from JSON, which has special escape rules.
            // A literal \n in the JSON will be interpreted as a line break.
            // Per convention, we interpret these as their literal values.
            "\b": "\\b",
            "\f": "\\f",
            "\r": "\\r",
            "\t": "\\t",
            "\n": "\\n",
            "\\": "\\\\",
            // Some descriptions may use <li> tags, replace by bullet points and
            // actual line breaks.
            "<li>": "\n\n * ",
            "<br>": " ",
            "<br/>": " ",
        };

        for (const [s, r] of Object.entries(replacements)) {
            str = str.split(s).join(r);
        }

        // Fix deprecated |..| notation for refs.
        str = str.replace(/\|([^|]+)\|/g, "$(ref:$1)");
        // Temporary: Fix trailing () at end of refs.
        str = str.replace(/\$\(ref:(.*?)\(\)\)/g, "$(ref:$1)");
        // Replace refs.
        if (resolveRef) {
            str = str.replace(/\$\(ref:(.*?)\)/g, (match, inner) => resolveRef(inner));
        }
        str = str.replace(/\$\((doc:(.*?))\)/g, ":doc:`$2`");
        // Replace deprecated $(topic:...) references with their plain link text.
        str = str.replace(/\$\((topic:[^\)]+)\)\[(.*?)\]/g, "$2");
        // Replace URLs.
        str = str.replace(/<a href="(.*?)">(.*?)<\/a>/g, "`$2 <$1>`__");
        str = str.replace(/<a href='(.*?)'>(.*?)<\/a>/g, "`$2 <$1>`__");
        // Replace permissions.
        if (trackPermission) {
            str = str.replace(/<permission>(.*?)<\/permission>/g, (match, permission) => {
                trackPermission(permission);
                return `:permission:${SBT}${permission}${SBT}`;
            });
        } else {
            str = str.replace(/<permission>(.*?)<\/permission>/g, `:permission:${SBT}$1${SBT}`);
        }

        return str;
    }

    replace_code(str) {
        return Writer.convertMarkupToRst(str, {
            resolveRef: inner => this.format_link(inner),
            trackPermission: permission => this.foundPermissions.add(permission),
        });
    }

    reference(refId) {
        if (refId === null || refId === undefined) {
            return [];
        }

        return [
            "",
            `.. _${tools.escapeUppercase(refId)}:`,
            ""
        ];
    }

    format_link(ref, track = false) {
        if (ref === "extensionTypes.File") {
            return "`File <https://developer.mozilla.org/en-US/docs/Web/API/File>`__";
        }
        if (ref === "extensionTypes.Date") {
            return "`Date <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date>`__";
        }
        if (ref === "runtime.Port") {
            return "`Port <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/Port>`__";
        }

        const matchingNamespace = this.NAMESPACE_NAMES.find(e => ref.startsWith(`${e}.`));
        if (!matchingNamespace && !this.ADDITIONAL_TYPE_PREFIXES.some(e => ref.startsWith(e))) {
            let strippedRef = ref.split(".").at(-1);
            // This is a reference using no namespace or the wrong namespace.
            // 1. It may just be a local reference:
            //    * Window instead of Windows.Window
            // 2. It may aim at a non-local namespace defined in the same file:
            //    * MailingListNode used in contacts.*
            // 3. It may not specifying the full path, skipping the top level:
            //    * mailingList.MailingListNode instead of
            //      addressBooks.mailingList.MailingListNode
            //
            // Check RELATED_NAMESPACE_NAMES!
            let fixedRef = `${this.namespaceName}.${strippedRef}`;
            const isLocal = (this.namespaceSchema.types || []).find(e => e.id && e.id === strippedRef);
            if (!isLocal && this.RELATED_NAMESPACE_NAMES.length > 1) {
                let isRelated = false;
                for (let relatedNamespaceName of this.RELATED_NAMESPACE_NAMES) {
                    isRelated = (this.SCHEMAS.get(relatedNamespaceName) || []).some(n => n.types && n.types.some(t => t.id === strippedRef))
                    if (isRelated) {
                        fixedRef = `${relatedNamespaceName}.${strippedRef}`;
                        break;
                    }
                }
                if (!isRelated) {
                    this.reportFixMeIfTriggered(true, "Unknown namespace", ref);
                }
            }
            ref = fixedRef;
        }

        // Keep track of all used types, which have to be included on the local
        // API documentation. This will mostly be those from this API, but also
        // some global ones.
        if (track && [`${this.namespaceName}.`, ...this.ADDITIONAL_TYPE_PREFIXES].some(e => ref.startsWith(e))) {
            this.foundTypes.add(ref);
        }

        // All needed types will be linked to the local API page.
        if (this.ADDITIONAL_TYPE_PREFIXES.some(e => ref.startsWith(e))) {
            ref = [this.namespaceName, ...ref.split(".").slice(1)].join(".");
        }

        // Setting sub-namespaces don't have RST section headings, so :ref:
        // needs explicit display text.
        if (this.SETTING_NAMES.has(ref)) {
            const displayName = ref.split(".").pop();
            return `:ref:${SBT}${displayName} <${tools.escapeUppercase(ref)}>${SBT}`;
        }

        return `:ref:${SBT}${tools.escapeUppercase(ref)}${SBT}`;
    }

    get_api_member_parts(name, value, refId) {
        const parts = {
            name: "",
            type: "",
            type_annotation: "", //Unsupported or Deprecated
            annotation: "",
            description: new AdvancedArray(),
            enum: new AdvancedArray(),
            refName: name,
        };

        // The return element is using a fake "_returns" name
        let type_string = "%s";
        if (name === "_returns") {
            if (value.optional) {
                type_string = "%s";
            }
        } else if (name) {
            type_string = "(%s)";
            if (value.optional) {
                parts.name = `[${DBT}${name}${DBT}]`;
                type_string = "(%s, optional)";
            } else {
                parts.name = `${DBT}${name}${DBT}`;
            }
        }

        if ("type" in value || "$ref" in value) {
            parts.type = type_string.replace("%s", this.get_type(value, name));
        } else if ("choices" in value) {
            const choices = value.choices.map(choice => this.get_type(choice, name));
            parts.type = type_string.replace("%s", choices.join(" or "));
        }

        if ("unsupported" in value) {
            parts.type_annotation += " **Unsupported.**";
        } else if ("deprecated" in value) {
            parts.type_annotation += " **Deprecated.**";
        }

        parts.description.append(this.format_description(value));
        parts.annotation = this.format_addition(value, 2);
        parts.enum.append(this.format_enum(name, value, refId));

        return parts;
    }

    get_type(obj, name) {
        if ("type" in obj) {
            if (obj.enum != null) {
                return `${SBT}${obj.type}${SBT}`;
            } else if (obj.type === "array") {
                if ("items" in obj) {
                    if ("choices" in obj.items) {
                        const choices = obj.items.choices.map(choice => this.get_type(choice, name));
                        return `array of ${choices.join(" or ")}`;
                    } else {
                        return `array of ${this.get_type(obj.items, name)}`;
                    }
                } else {
                    return "array";
                }
            } else if ("isInstanceOf" in obj) {
                return `${SBT}${obj.isInstanceOf} <https://developer.mozilla.org/en-US/docs/Web/API/${obj.isInstanceOf}>${SBT}__`;
            } else {
                return obj.type;
            }
        } else if ("$ref" in obj) {
            return this.format_link(obj["$ref"], true);
        }
    }

    async generateManifestSection() {
        let section = new AdvancedArray();
        if (this.manifestSchema.types) {
            for (let type of this.manifestSchema.types) {
                if (type.$extend === "WebExtensionManifest") {
                    // Sort by property name, unless "sort" key overrides
                    let items = Object.entries(type.properties).sort(([aKey, aVal], [bKey, bVal]) => {
                        let aSort = "sort" in aVal ? aVal.sort : aKey;
                        let bSort = "sort" in bVal ? bVal.sort : bKey;
                        return aSort < bSort ? -1 : aSort > bSort ? 1 : 0;
                    });
                    for (let [name, value] of items) {
                        section.append(this.format_object(name, value, {
                            refId: `${this.namespaceName}.${name}`
                        }));
                    }
                }
            }
        }

        if (section.length > 0) {
            section.prepend(this.format_section_heading("Manifest file properties"));
            this.sidebar.set("manifest", "  * `Manifest file properties`_");
        }

        return section;
    }

    async generatePermissionsSection() {
        let permissionStrings = {};
        for (let line of this.PERMISSION_LOCALES.split("\n")) {
            if (line.startsWith("webext-perms-description")) {
                let parts = line.split("=", 2);
                let permissionName = parts[0]
                    .slice(25)
                    .replace(/-/g, ".")
                    .trim()
                    .replace(/[0-9]/g, "");
                let permissionDescription = parts[1].trim();
                if (!permissionDescription.endsWith(".")) {
                    permissionDescription = `${permissionDescription}.`
                }
                permissionStrings[permissionName] = permissionDescription;
            }
        }

        let manifestPermissions = new AdvancedArray();
        manifestPermissions.append(await this.format_manifest_permissions());

        // Include all permissions used somewhere in this API.
        // TODO: SensitiveDataUpload
        let usedPermissions = new AdvancedArray();

        for (const value of Array.from(this.foundPermissions).sort()) {
            let description = this.replace_code(strings.permission_descriptions[value])
                || permissionStrings[value]
                || (this.NAMESPACE_NAMES.includes(value) && strings.permission_descriptions["*"].replace("$NAME$", value))
                || "";

            if (!description) {
                this.reportFixMeIfTriggered(true, "Missing permission description for", value)
            }

            usedPermissions.append(this.api_member({
                name: `:permission:${SBT}${value}${SBT}`,
                description: [description],
                refId: `${this.namespaceName}.permission.${value}`,
                refName: value,
            }));
        }

        let section = new AdvancedArray();
        if (manifestPermissions.length > 0 || usedPermissions.length > 0) {
            section.append(this.format_section_heading("Permissions"));
            if (usedPermissions.length > 0) {
                section.addParagraph(strings.permission_header)
                section.append([
                    "",
                    ".. hint::",
                    "",
                    "   " + strings.permission_warning,
                    ""
                ])
                section.append(usedPermissions);
            }
            section.append(manifestPermissions);
            this.sidebar.set("permissions", "  * `Permissions`_");
        }

        return section;
    }

    async generateFunctionsSection() {
        if (!Array.isArray(this.namespaceSchema.functions) || this.namespaceSchema.functions.length === 0) {
            return null;
        }

        const section = new AdvancedArray();
        for (let obj of this.namespaceSchema.functions.sort((a, b) => a.name.localeCompare(b.name))) {
            // Skip if this function is not supported
            const { version_added } = obj?.annotations?.find(a => "version_added" in a) ?? {};
            if (version_added === false) {
                continue;
            }

            section.append(this.format_entry_heading(
                `${obj.name}(${this.format_params(obj, { callback: obj.async })})`,
                {
                    label: `${this.namespaceName}.${obj.name}`,
                    info: this.format_addition(obj, 1)
                }
            ));

            section.append(this.format_description(obj));

            if (Array.isArray(obj.parameters) && obj.parameters.length > 0) {
                let content = new AdvancedArray();
                for (const param of obj.parameters) {
                    if (obj.async === param.name) {
                        // used for callback type
                        if (param.parameters && param.parameters.length > 0) {
                            obj.returns = param.parameters[0];
                        }
                    } else {
                        content.append(this.format_object(param.name, param, {
                            refId: `${this.namespaceName}.${obj.name}.${param.name}`
                        }));
                    }
                }
                if (content.length > 0) {
                    section.append(this.api_header("Parameters", content));
                }
            }

            if ("returns" in obj) {
                const content = new AdvancedArray();
                content.append(this.format_object("_returns", obj.returns, {
                    refId: `${this.namespaceName}.${obj.name}.returns`
                }));
                content.append([
                    "",
                    ".. _Promise: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise"
                ]);
                section.append(this.api_header("Return type (`Promise`_)", content));
            }

            section.append(this.format_required_permissions(obj));

            //if ("hints" in func) {
            //    lines.push(...format_hints(func));
            //}

        }

        // Early exit if no functions have been found.
        if (section.length === 0) {
            return null;
        }

        this.sidebar.set("functions", "  * `Functions`_");

        section.prepend(this.format_section_heading("Functions"));
        return section;
    }

    async generateEventsSection() {
        if (!Array.isArray(this.namespaceSchema.events) || this.namespaceSchema.events.length === 0) {
            return null;
        }

        const section = new AdvancedArray();
        for (let event of this.namespaceSchema.events.sort((a, b) => a.name.localeCompare(b.name))) {
            const { version_added } = event?.annotations?.find(a => "version_added" in a) ?? {};
            if (version_added === false) {
                continue;
            }

            section.append(this.format_entry_heading(
                `${event.name}`, // could also add params later: `${event.name}(${format_params(event)})`
                {
                    label: `${this.namespaceName}.${event.name}`,
                    info: this.format_addition(event, 1)
                }
            ));

            section.append(this.format_description(event));

            const listener = {
                name: `listener(${event.parameters?.map(p => p.name).join(", ") || ""})`,
                description: "A function that will be called when this event occurs.",
            };

            let content = new AdvancedArray();
            for (const param of [listener, ...(event.extraParameters || [])]) {
                content.append(this.format_object(param.name, param, {
                    refId: `${this.namespaceName}.${event.name}.${param.name}`
                }));
            }

            const extraParams = (event.extraParameters || []).map(p => p.name);
            section.append(this.api_header(
                `Parameters for ${event.name}.addListener(${["listener", ...extraParams].join(", ")})`,
                content
            ));

            if ("parameters" in event && event.parameters.length) {
                content = new AdvancedArray();
                for (const param of event.parameters) {
                    content.append(this.format_object(param.name, param, {
                        refId: `${this.namespaceName}.${event.name}.${param.name}`
                    }));
                }
                section.append(
                    this.api_header("Parameters passed to the listener function", content)
                );
            }

            if ("returns" in event) {
                section.append(this.api_header(
                    "Expected return value of the listener function",
                    this.format_object("", event.returns, {
                        refId: `${this.namespaceName}.${event.name}.returns`
                    })
                ));
            }

            section.append(this.format_required_permissions(event));
        }

        // Early exit if no events have been found.
        if (section.length === 0) {
            return null;
        }
        this.sidebar.set("events", "  * `Events`_");

        section.prepend(this.format_section_heading("Events"));
        return section;
    }

    async generateTypesSection() {
        // Add all types from the manifest and the api.
        (this.manifestSchema.types || []).filter(e => e.id).forEach(e => this.foundTypes.add(`${this.namespaceName}.${e.id}`));
        (this.namespaceSchema.types || []).filter(e => e.id).forEach(e => this.foundTypes.add(`${this.namespaceName}.${e.id}`));

        if (!this.foundTypes.size) {
            return null;
        }

        const strip_namespace_prefix = (ref) => {
            const prefix = `${this.namespaceName}.`;
            if (ref.startsWith(prefix)) {
                return ref.slice(prefix.length);
            }
            return ref;
        }

        // We use a writer for each type definition, so we can add types as we go
        // and sort them at the end. We loop over foundTypes until it does not change
        // anymore (to find nested types).
        const definitions = new Map();
        let done = false;
        do {
            let prevFoundSize = this.foundTypes.size;
            for (const id of [...this.foundTypes]) {
                const strippedId = strip_namespace_prefix(id);
                const typeDef = this.TYPES.get(id)
                    || (this.namespaceSchema.types && this.namespaceSchema.types.find(e => e.id && e.id === strippedId))
                    || (this.manifestSchema.types && this.manifestSchema.types.find(e => e.id && e.id === strippedId))
                    // Some manifest types are sadly not referenced as such,
                    // but appear as local types.
                    || this.reportFixMeIfTriggered(this.TYPES.get(`manifest.${strippedId}`), "Missing manifest prefix in reference", this.namespaceName, strippedId)
                    // Some extensionTypes types are sadly not referenced as such,
                    // but appear as local types (needs to be checked last!).
                    || this.reportFixMeIfTriggered(this.TYPES.get(`extensionTypes.${strippedId}`), "Missing extensionTypes prefix in reference", this.namespaceName, strippedId);

                if (typeDef && definitions.has(typeDef.id)) {
                    continue;
                }

                // A simple startsWith() is not sufficient to determine if this
                // is a local type or not. It could be for example addressBooks
                // or addressBooks.contacts.
                const bestNamespaceMatch = this.NAMESPACE_NAMES
                    .filter(e => id.startsWith(`${e}.`))
                    .reduce((a, b) => (b.length > a.length ? b : a), "");

                if (typeDef) {
                    definitions.set(typeDef.id, this.format_type(typeDef));
                } else if (done && this.namespaceName === bestNamespaceMatch) {
                    // We are done, but this is missing, log it.
                    this.reportFixMeIfTriggered(true, "Missing type definition", this.namespaceName, id)
                };
            }

            if (done) {
                break;
            }
            if (prevFoundSize === this.foundTypes.size) {
                done = true;
            }
        } while (true)

        const section = new AdvancedArray();
        [...definitions.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .forEach(([id, definition]) => section.addSection(definition));

        // Early exit if no types have been found.
        if (section.length === 0) {
            return null;
        }
        this.sidebar.set("types", "  * `Types`_");

        section.prepend(this.format_section_heading("Types"));
        return section;
    }

    async generatePropertiesSection() {
        const constants = [];
        for (const key of Object.keys(this.namespaceSchema.properties || {}).sort((a, b) => a.localeCompare(b))) {
            const property = this.namespaceSchema.properties[key];
            const { version_added } = property?.annotations?.find(a => "version_added" in a) ?? {};
            if (version_added === false) {
                continue;
            }
            constants.push({ key, property });
        }

        const settings = [...this.SETTING_SUB_NAMESPACES]
            .sort((a, b) => a.name.localeCompare(b.name));

        if (constants.length === 0 && settings.length === 0) {
            return null;
        }

        const section = new AdvancedArray();

        // Settings section.
        if (settings.length > 0) {
            this.sidebar.set("settings", "  * `Settings`_");
            section.append(this.format_section_heading("Settings"));

            // Hidden toctree for setting sub-pages.
            section.append([
                ".. toctree::",
                "  :hidden:",
                "",
                ...settings.map(s => {
                    const shortName = s.name.split(".").pop();
                    return `  ${shortName} <${s.name}>`;
                }),
                "",
            ]);

            for (const setting of settings) {
                const shortName = setting.name.split(".").pop();
                section.append(this.format_setting_heading(
                    shortName,
                    {
                        docRef: setting.name,
                        access: setting.readOnly ? "read" : "write",
                        addition: this.format_addition(setting, 1)
                    }
                ));
                section.append(this.format_description(setting));
                section.append(this.format_setting_footer());
                section.append("");
            }
        }

        // Properties section (constants).
        if (constants.length > 0) {
            this.sidebar.set("properties", "  * `Properties`_");
            section.append(this.format_section_heading("Properties"));

            for (const { key, property } of constants) {
                section.append(this.format_entry_heading(
                    key,
                    {
                        label: `${this.namespaceName}.${key}`,
                        info: this.format_addition(property, 1)
                    }
                ));
                if (property.description) {
                    section.append(this.format_description(property));
                }
                section.append("");
            }
        }

        return section;
    }

    async generateApiDoc() {
        // For setting sub-namespaces, use the parent namespace name as the
        // page title (e.g. "messengerSettings API" instead of
        // "messengerSettings.readerDisplayAttachmentsInline API").
        const propertyName = this.namespaceName.split(".").pop();
        const title = this.IS_SETTING
            ? `${propertyName} Setting`
            : `${this.namespaceName} API`;
        const doc = new AdvancedArray();
        const manifest = await this.generateManifestSection();
        const functions = await this.generateFunctionsSection();
        const events = await this.generateEventsSection()
        const properties = await this.generatePropertiesSection()
        const types = await this.generateTypesSection()

        // Last, because it needs api.foundPermissions to be populated.
        const permissions = await this.generatePermissionsSection();

        if (this.IS_SETTING) {
            this.sidebar.set("examples", "  * `Examples`_");
        }

        doc.append([
            ".. container:: sticky-sidebar",
            "",
            `  ≡ ${title}`,
            "",
            this.sidebar.get("manifest"),
            this.sidebar.get("permissions"),
            this.sidebar.get("examples"),
            this.sidebar.get("functions"),
            this.sidebar.get("events"),
            this.sidebar.get("types"),
            this.sidebar.get("settings"),
            this.sidebar.get("properties"),
            "",
            "  .. include:: /_includes/developer-resources.rst",
            "",
            "=".repeat(title.length),
            title,
            "=".repeat(title.length),
            "",
            ".. role:: permission",
            "",
            ".. role:: value",
            "",
            ".. role:: code",
            "",
            ".. role:: small",
            "",
        ])

        let mdn_documentation_url = this.namespaceSchema?.annotations?.find(e => e.mdn_documentation_url)?.mdn_documentation_url;
        if (mdn_documentation_url) {
            doc.append([
                ".. hint::",
                "",
                "   " + strings.mozilla_api
                    .replace("$NAME$", this.namespaceName)
                    .replace("$LINK$", `${SBT}MDN <${mdn_documentation_url}>${SBT}__`)
            ])
        }

        if (this.IS_SETTING) {
            doc.append(this.reference(`${this.namespaceName}`));
            doc.append(this.format_description(this.namespaceSchema));
        } else {
            doc.append(this.format_description(this.namespaceSchema));
        }

        doc.addSection(manifest);
        doc.addSection(permissions);

        if (this.IS_SETTING) {
            // Examples section for setting sub-pages.
            const hasSet = this.namespaceSchema.functions?.some(f => f.name === "set");
            const apiPath = `messenger.${this.namespaceName}`;
            const examples = [
                "",
                ".. rst-class:: api-main-section",
                "",
                "Examples",
                "========",
                "",
                `To read the :value:\`${propertyName}\` setting:`,
                "",
                ".. code-block:: javascript",
                "",
                `   let { value } = await ${apiPath}.get({});`,
                "",
            ];
            if (hasSet) {
                examples.push(
                    `To update the :value:\`${propertyName}\` setting:`,
                    "",
                    ".. code-block:: javascript",
                    "",
                    `   await ${apiPath}.set({ value: <newValue> });`,
                    "",
                    `To clear the :value:\`${propertyName}\` setting and restore the default value:`,
                    "",
                    ".. code-block:: javascript",
                    "",
                    `   await ${apiPath}.clear({});`,
                    "",
                );
            }
            doc.append(examples);
        }
        doc.addSection(functions);
        doc.addSection(events);
        doc.addSection(types);
        doc.addSection(properties);

        return doc;
    }
}