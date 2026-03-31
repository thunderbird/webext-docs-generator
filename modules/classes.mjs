export class AdvancedArray extends Array {
    append(item) {
        if (Array.isArray(item)) {
            this.push(...item);
        } else {
            this.push(item);
        }
        return this;
    }

    prepend(item) {
        if (Array.isArray(item)) {
            this.unshift(...item);
        } else {
            this.unshift(item);
        }
        return this;
    }

    addSection(section) {
        if (!section) return;
        this.push(...section);
        return this;
    }

    addParagraph(paragraph) {
        if (!paragraph) return;
        this.push("", paragraph, "");
    }

    addParagraphs(paragraphs) {
        for (let paragraph of paragraphs) {
            this.addParagraph(paragraph);
        }
    }

    toString() {
        // Remove consecutive empty rows before joining the collected lines.
        const clean = this
            .filter(e => e !== undefined)
            .flatMap((item, i, arr) => {
                const isEmpty = item.trim() === "";
                const prevIsEmpty = i > 0 && arr[i - 1].trim() === "";

                return isEmpty && prevIsEmpty
                    ? []                     // skip consecutive empties
                    : [isEmpty ? "" : item]; // supress spaces on empty lines
            });
        return clean.join("\n");
    }
}

export class LevelState {
    constructor() {
        this.levels = new Map();
    }

    setLevel(level, data) {
        // Remove deeper levels.
        for (const l of [...this.levels.keys()]) {
            if (l > level) {
                this.levels.delete(l);
            }
        }
        this.levels.set(level, data);
    }

    isDifferentFromParent(level, data) {
        this.setLevel(level, data);
        const prev = this.levels.get(level - 1);
        const curr = this.levels.get(level);
        return prev !== curr;
    }
}