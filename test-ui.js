(() => {
    // =========================
    // DEFAULT_CONFIG
    // =========================
    const DEFAULT_CONFIG = {
        SCROLL_CONTAINER_SELECTOR: '',
        COMPARE_MODE: "exact", // "exact" | "contains"
        ROW_INDEX_ATTR: "data-index",
        HIGHLIGHT_WRONG_STYLE:
            "outline: 3px solid #ff3b30; box-shadow: 0 0 0 4px rgba(255,59,48,0.2); border-radius: 10px; padding: 10px",
        HIGHLIGHT_UNKNOWN_STYLE:
            "outline: 3px solid #ff9500; box-shadow: 0 0 0 4px rgba(255,149,0,0.18); border-radius: 10px; padding: 10px",
        SCROLL_STEP: 350, // Mỗi lần scroll xuống bao nhiêu px
        SETTLE_MS: 120, // Scroll xong đợi bao lâu để DOM update (tanstack virtual cần thời gian render)
        MAX_LOOP: 300,  // Giới hạn để tránh infinite loop nếu scroll container lạ
    };

    const normalize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

    const compareText = (actual = "", expected = "") => {
        const textActual = normalize(actual);
        const textExpected = normalize(expected);

        if (COMPARE_MODE === "exact") return textActual === textExpected;

        return textActual.includes(textExpected);
    };

    const promptRequired = (label = "", placeholderExample = "") => {
        while (true) {
            const input = prompt(`${label} \r\n\n Example:\n ${placeholderExample} \r\n\n(Required)`);

            if (input === null || input === undefined) return null;

            if (input.trim() !== "") return input.trim();

            alert("This field is required. Please enter a value.");
        }
    }

    const promptOptional = (label = "", defaultValue = "", placeholderExample = "") => {
        const hint =
            placeholderExample?.trim()
                ? `\r\n\n Example:\n ${placeholderExample}`
                : "";

        const input = prompt(
            `${label} \r\n\n Default (press Enter to keep): \n${defaultValue}${hint} \r\n\n(Optional)`,
            defaultValue
        );

        if (input === null || input === undefined) return null;

        return input.trim() === "" ? defaultValue : input.trim();
    }

    const parseJsonRequired = (label = "", example = "") => {
        while (true) {
            const text = promptRequired(label, example);

            if (text === null || text === undefined) return null;

            try {
                const parsed = JSON.parse(text);
                return parsed;
            } catch (e) {
                alert(`Invalid JSON. Please try again.\r\nError:\n${e.message}`);
            }
        }
    }

    const parseJsonObjectRequired = (label = "", example = "") => {
        const parsed = parseJsonRequired(label, example);

        if (parsed === null || parsed === undefined) return null;

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;

        alert("This JSON must be an object (e.g. { 'STATUS=101': 'Sold' }).");

        return parseJsonObjectRequired(label, example);
    }

    // =========================
    // Safe path getter
    // =========================
    const getByPath = (obj, path) => {
        if (!path) return obj;

        const parts = path
            .split(".")
            .map((p) => p.trim())
            .filter(Boolean);

        let cur = obj;

        for (const key of parts) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[key];
        }

        return cur;
    }

    // VALUES REQUIRED
    const API_JSON = parseJsonRequired(
        "1) Paste API JSON (full response)",
        `{ "DATA" :{ "CAR_LIST": [ { "STATUS": 101 }, { "STATUS": 201 } ] } }`
    );
    if (API_JSON === null || API_JSON === undefined) return;

    const ITEM_SELECTOR = promptRequired(
        "2) Enter ITEM SELECTOR (selector of the pattern text element)",
        `.price \r\n .status-badge \r\n [data-col="status"]`
    );
    if (ITEM_SELECTOR === null || ITEM_SELECTOR === undefined) return;


    const MAPPING = parseJsonObjectRequired(
        "3) Paste MAPPING JSON (statusCode -> expectedText)",
        `Đối với 1 field:\r\n {\r\n "STATUS=101": "即決落札可",\r\n "STATUS=102": "成約",\r\n "STATUS=103": "商談受付中"\r\n }\r\nĐối với từ 2 field trở lên:\r\n {\r\n "STATUS=201|OTHER=true": "Neg. (Other Co.)",\r\n "STATUS=201|OTHER=false": "Neg. (Your Co.)"\r\n }`
    );
    if (MAPPING === null || MAPPING === undefined) return;

    const LIST_PATH = promptRequired(
        "4) Enter list path in API JSON (GET_LIST_FROM_JSON)",
        `DATA.CAR_LIST \r\n items \r\n result.list`
    );
    if (LIST_PATH === null || LIST_PATH === undefined) return;

    const STATUS_FIELD_PATH = promptRequired(
        "5) Enter status field path in each list item",
        `STATUS \r\n status \r\n meta.status \r\n STATUS,OTHER \r\n STATUS,OTHER,TYPE`
    );
    if (STATUS_FIELD_PATH === null || STATUS_FIELD_PATH === undefined) return;

    // VALUES OPTIONAL
    const SCROLL_CONTAINER_SELECTOR = promptOptional(
        "6) (Optional) Scroll Container Selector (Leave Default to Auto Detect)",
        DEFAULT_CONFIG.SCROLL_CONTAINER_SELECTOR,
        `.table-scroll \r\n #tableContainer`
    );
    if (SCROLL_CONTAINER_SELECTOR === null || SCROLL_CONTAINER_SELECTOR === undefined) return;

    const ROW_INDEX_ATTR = promptOptional(
        "7) (Optional) Row Index Attribute (Used By Virtual Rows)",
        DEFAULT_CONFIG.ROW_INDEX_ATTR,
        `data-index \r\n data-row-index \r\ndata-virtual-index`
    );
    if (ROW_INDEX_ATTR === null || ROW_INDEX_ATTR === undefined) return;

    const COMPARE_MODE = promptOptional(
        "8) (Optional) Compare Mode",
        DEFAULT_CONFIG.COMPARE_MODE,
        `contains \r\n exact`
    );
    if (COMPARE_MODE === null || COMPARE_MODE === undefined) return;

    const SCROLL_STEP = Number(
        promptOptional("9) (Optional) Scroll Step (px)", String(DEFAULT_CONFIG.SCROLL_STEP), "350")
    );

    const SETTLE_MS = Number(
        promptOptional("10) (Optional) Settle Time After Scroll (ms)", String(DEFAULT_CONFIG.SETTLE_MS), "120")
    );

    const MAX_LOOP = Number(
        promptOptional("11) (Optional) Max Scroll Loops (safety)", String(DEFAULT_CONFIG.MAX_LOOP), "300")
    );

    // =========================
    // Build functions from paths
    // =========================
    // VD INPUT  => STATUS,OTHER,TYPE
    // VD OUTPUT => ["STATUS", "OTHER", "TYPE"]
    // fieldPaths chính là danh sách các đường dẫn field mà chúng ta muốn dùng để tạo key
    const fieldPaths = STATUS_FIELD_PATH.split(",").map((s) => s.trim()).filter(Boolean);

    const GET_LIST_FROM_JSON = (json) => getByPath(json, LIST_PATH) || [];

    // Compound Key Builder: STATUS=201|OTHER=true|TYPE=A
    const BUILD_COMPOUND_KEY = (apiItem) => {
        return fieldPaths
            .map((path) => {
                // - apiItem là 1 object trong response list api
                // - path là tên field hoặc path sâu như "meta.status"
                const raw = getByPath(apiItem, path);

                // VD: apiItem = { STATUS: 201, OTHER: true, TYPE: "A" }
                // getByPath(apiItem, "STATUS") → 201
                // getByPath(apiItem, "OTHER") → true
                // getByPath(apiItem, "TYPE") → "A"

                const value =
                    raw === null ? "null" : raw === undefined ? "undefined" : String(raw).trim();
                return `${path}=${value}`;
            })
            .join("|");

        // ["STATUS=201", "OTHER=true", "TYPE=A"].join("|")
        // => "STATUS=201|OTHER=true|TYPE=A" => Đây chính là compoundKey
    };

    // =========================
    // Extract list array
    // =========================
    const apiList = GET_LIST_FROM_JSON(API_JSON);
    if (!Array.isArray(apiList) || !apiList.length) {
        console.warn("❌ Không lấy được list từ API_JSON. Vui lòng kiểm tra lại data của bạn.");
        console.log("API_JSON:", API_JSON);
        console.log("Extracted value:", apiList);
        return;
    }

    // =========================
    // Read DOM list
    // =========================
    const listItemData = Array.from(document.querySelectorAll(ITEM_SELECTOR));
    if (!listItemData.length) {
        console.warn(`❌ Không tìm thấy DOM items với selector "${ITEM_SELECTOR}".`);
        return;
    }

    // =========================
    // Detect scroll container
    // =========================
    function findScrollContainer(cellElement) {
        if (!cellElement) return null;

        // Đi lên cha (parent) cho đến khi gặp element có thể scroll
        let el = cellElement.parentElement;
        while (el && el !== document.body) {
            const style = getComputedStyle(el);
            const overflowY = style.overflowY;

            const canScroll =
                (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 10;
            if (canScroll) return el;

            el = el.parentElement;
        }
        return null;
    }

    const anyDomCell = document.querySelector(ITEM_SELECTOR);
    if (!anyDomCell) {
        console.warn(`❌ Cannot find any DOM elements with ITEM_SELECTOR="${ITEM_SELECTOR}"`);
        return;
    }

    let scrollEl = null;
    if (SCROLL_CONTAINER_SELECTOR && SCROLL_CONTAINER_SELECTOR.trim() !== "") {
        scrollEl = document.querySelector(SCROLL_CONTAINER_SELECTOR);
        if (!scrollEl) {
            console.warn(`❌ SCROLL_CONTAINER_SELECTOR was provided but not found: "${SCROLL_CONTAINER_SELECTOR}"`);
            return;
        }
    } else {
        scrollEl = findScrollContainer(anyDomCell);
        if (!scrollEl) {
            console.warn("❌ Auto-detect scroll container failed. Provide SCROLL_CONTAINER_SELECTOR manually.");
            return;
        }
    }

    // =========================
    // Helpers to find rows
    // =========================
    function findRowFromCell(cell) {
        return (
            cell.closest("tr") ||
            cell.closest('[role="row"]') ||
            cell.closest(".row") ||
            cell.closest("[data-index]") ||
            cell.closest(`[${ROW_INDEX_ATTR}]`) ||
            cell.parentElement
        );
    }

    function getRenderedRows() {
        const cells = Array.from(scrollEl.querySelectorAll(ITEM_SELECTOR));
        const rows = [];
        const seen = new Set();

        for (const cell of cells) {
            const row = findRowFromCell(cell);
            if (!row) continue;

            if (seen.has(row)) continue;

            seen.add(row);

            rows.push(row);
        }
        return rows;
    }

    function getRowIndex(row) {
        if (ROW_INDEX_ATTR) {
            const value = row.getAttribute(ROW_INDEX_ATTR);
            if (value !== null && value !== undefined && value !== "") return Number(value);
        }

        // fallback: try any data-index-like attribute
        for (const name of ["data-index", "data-row-index", "data-virtual-index"]) {
            const value = row.getAttribute(name);
            if (value !== null && value !== undefined && value !== "") return Number(value);
        }

        return null;
    }

    // =========================
    // Validate currently rendered rows
    // =========================
    const invalids = [];
    const unknowns = [];
    const checkedIndices = new Set();
    const keySamples = []; // for debugging mapping

    function validateVisible() {
        const rows = getRenderedRows();

        for (const row of rows) {
            const index = getRowIndex(row);

            if (index === null || index === undefined || Number.isNaN(index)) continue;
            if (index < 0 || index >= apiList.length) continue;

            if (checkedIndices.has(index)) continue;
            checkedIndices.add(index);

            const apiItem = apiList[index];

            const compoundKey = BUILD_COMPOUND_KEY(apiItem);
            const expectedText = MAPPING[compoundKey];

            const cell = row.querySelector(ITEM_SELECTOR) || row;
            const actualText = normalize(cell.innerText || cell.textContent || "");

            if (keySamples.length < 8) {
                keySamples.push({ index, compoundKey, actualText });
            }

            if (!expectedText) {
                row.style.cssText += `;${DEFAULT_CONFIG.HIGHLIGHT_UNKNOWN_STYLE}`;
                row.title = `⚠️ Unknown mapping key\nIndex=${index}\nKey=${compoundKey}\nActual="${actualText}"`;
                unknowns.push({ index, compoundKey, actualText });
                continue;
            }

            if (!compareText(actualText, expectedText)) {
                row.style.cssText += `;${DEFAULT_CONFIG.HIGHLIGHT_WRONG_STYLE}`;
                row.title = `❌ Wrong text\nIndex=${index}\nKey=${compoundKey}\nExpected="${expectedText}"\nActual="${actualText}"`;
                invalids.push({ index, compoundKey, expectedText, actualText });
            }
        }
    }

    // =========================
    // Scroll loop
    // =========================
    let loops = 0;

    async function run() {
        scrollEl.scrollTop = 0;
        await sleep(SETTLE_MS);
        validateVisible();

        while (
            // + Không vượt quá maxLoops
            loops++ < MAX_LOOP &&
            // + Chưa scroll đến cuối
            // - scrollTop: vị trí scroll hiện tại
            // - clientHeight: chiều cao phần visible
            // - scrollHeight: chiều cao tổng nội dung
            // => Nếu scrollTop + clientHeight >= scrollHeight thì đến cuối
            scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 5 &&
            // Chưa check đủ tất cả index
            checkedIndices.size < apiList.length
        ) {
            scrollEl.scrollTop += SCROLL_STEP;
            await sleep(SETTLE_MS);
            validateVisible();
        }

        // scroll xuống dưới đáy để chắc chắn
        scrollEl.scrollTop = scrollEl.scrollHeight;
        await sleep(SETTLE_MS);
        validateVisible();

        console.group(
            `%c[VirtualValidator Multi-field] checked=${checkedIndices.size}/${apiList.length} wrong=${invalids.length} unknown=${unknowns.length}`,
            invalids.length ? "color:#ff3b30;font-weight:800;" : "color:#1a7f37;font-weight:800;"
        );

        if (invalids.length) {
            console.group(`❌ Wrong items (${invalids.length})`);
            console.table(invalids);
            console.groupEnd();
        }

        if (unknowns.length) {
            console.group(`⚠️ Unknown mapping keys (${unknowns.length})`);
            console.table(unknowns);
            console.groupEnd();

            console.warn(
                "Tip: Copy one compoundKey from this table and add it to your MAPPING."
            );
        }

        // console.group("Key samples (debug mapping)");
        // console.table(keySamples);
        // console.groupEnd();

        if (checkedIndices.size < apiList.length) {
            console.warn(
                `⚠️ Not all rows were checked. Checked=${checkedIndices.size}/${apiList.length}.
                Possible reasons:
                - Your rows do not contain "${ROW_INDEX_ATTR}" attribute
                - Row detection failed (try adjusting ITEM_SELECTOR)
                - Your scroll container is not correct (set SCROLL_CONTAINER_SELECTOR manually)`
            );
        }

        console.groupEnd();
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    run();
})();
