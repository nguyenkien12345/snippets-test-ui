(() => {
    // =========================
    // DEFAULT_CONFIG
    // =========================
    const DEFAULT_CONFIG = {
        SCROLL_CONTAINER_SELECTOR: '',
        COMPARE_MODE: "contains", // "exact" | "contains"
        // + Phần quan trọng nhất trong virtual validator. Bạn phải có cách xác định:
        // - Row DOM này đang đại diện cho item thứ mấy trong Api List
        // + TanStack Virtual thường set:
        // - data-index
        // - style transform: translateY(...)
        // + Ưu tiên đọc từ attribute
        ROW_INDEX_ATTR: "data-index",
        HIGHLIGHT_WRONG_STYLE:
            "outline: 3px solid #ff3b30; box-shadow: 0 0 0 4px rgba(255,59,48,0.2); border-radius: 10px; padding: 10px",
        HIGHLIGHT_UNKNOWN_STYLE:
            "outline: 3px solid #ff9500; box-shadow: 0 0 0 4px rgba(255,149,0,0.18); border-radius: 10px; padding: 10px",
        // Mỗi lần scroll xuống bao nhiêu px
        SCROLL_STEP: 350,
        // Scroll xong đợi bao lâu để DOM update (tanstack virtual cần thời gian render)
        SETTLE_MS: 120,
        // Giới hạn để tránh infinite loop nếu scroll container lạ
        MAX_LOOP: 300,
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

        alert("This JSON must be an object (e.g. { \"101\": \"text\" }).");

        return parseJsonObjectRequired(label, example);
    }

    // =========================
    // Safe path getter
    // =========================
    const getByPath = (obj, path) => {
        if (!path) return obj;

        const parts = path.split(".").map((p) => p.trim()).filter(Boolean);

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
        `{ "101": "即決落札可", "102": "成約", "201": "商談受付中" }`
    );
    if (MAPPING === null || MAPPING === undefined) return;

    const LIST_PATH = promptRequired(
        "4) Enter list path in API JSON (GET_LIST_FROM_JSON)",
        `DATA.CAR_LIST \r\n items \r\n result.list`
    );
    if (LIST_PATH === null || LIST_PATH === undefined) return;

    const STATUS_FIELD_PATH = promptRequired(
        "5) Enter status field path in each list item (GET_PATTERN_FIELD)",
        `STATUS \r\n status \r\n meta.status`
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
    const GET_LIST_FROM_JSON = (json) => getByPath(json, LIST_PATH) || [];
    const GET_PATTERN_FIELD = (apiItem) => (getByPath(apiItem, STATUS_FIELD_PATH));

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
            // Script sẽ kiểm tra:
            // + overflowY là auto hoặc scroll
            // + scrollHeight > clientHeight + 10
            // => Nếu thoả 2 điều kiện trên đó là scroll container.
            // => Bắt buộc phải check scrollHeight vì có overflow auto nhưng không thật sự scroll (nội dung nhỏ)

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
        // prefer tr for table; else find something that looks like a row
        return (
            cell.closest("tr") ||
            cell.closest('[role="row"]') ||
            cell.closest(".row") ||
            cell.closest("[data-index]") ||
            cell.parentElement
        );
    }

    function getRenderedRows() {
        // Lấy tất cả cell hiện đang render trong scroll container
        const cells = Array.from(scrollEl.querySelectorAll(ITEM_SELECTOR));
        const rows = [];
        const seen = new Set();

        // map mỗi cell → row
        for (const cell of cells) {
            const row = findRowFromCell(cell);
            if (!row) continue;

            // Dùng seen để tránh duplicate (vì 1 row có thể chứa nhiều .price)
            if (seen.has(row)) continue;

            seen.add(row);

            rows.push(row);
        }
        return rows;
    }

    // Chúng ta cần index vì virtual table render theo viewport, row DOM không phải row 0..10 luôn luôn.
    // Nó là row nào đang visible.
    function getRowIndex(row) {
        // row có data-index="12" → index=12
        // row có data-row-index="0" → index=0
        if (ROW_INDEX_ATTR) {
            const value = row.getAttribute(ROW_INDEX_ATTR);
            if (value !== null && value !== undefined && value !== "") return Number(value);
        }

        // fallback: try any data-index-like attribute
        for (const name of ["data-index", "data-row-index", "data-virtual-index"]) {
            const value = row.getAttribute(name);
            if (value !== null && value !== undefined && value !== "") return Number(value);
        }

        // Ngược lại không có thì row đó sẽ bị skip.
        return null;
    }

    // =========================
    // Validate currently rendered rows
    // =========================
    const invalids = [];
    const unknowns = [];
    const checkedIndices = new Set();

    function validateVisible() {
        const rows = getRenderedRows();

        for (const row of rows) {
            const index = getRowIndex(row);

            // Row không có index thì bỏ qua
            if (index === null || index === undefined || Number.isNaN(index)) continue;

            // index không nằm trong range list thì bỏ qua
            if (index < 0 || index >= apiList.length) continue;

            // index đã check bị trùng lặp thì bỏ qua
            // Vì khi scroll, row index 0 có thể render lại nhiều lần (scroll lên xuống).
            // Nếu validate lại thì:
            // - Tốn thời gian
            // - Highlight lại
            // - Duplicate report
            if (checkedIndices.has(index)) continue;
            checkedIndices.add(index);

            const apiItem = apiList[index];

            const status = GET_PATTERN_FIELD(apiItem);
            const expected = normalize(MAPPING[status]);

            const cell = row.querySelector(ITEM_SELECTOR) || row;
            const actual = normalize(cell.innerText || cell.textContent || "");

            if (!expected) {
                row.style.cssText += `;${DEFAULT_CONFIG.HIGHLIGHT_UNKNOWN_STYLE}`;
                row.title = `⚠️ No mapping for status=${status} (index=${index})`;
                unknowns.push({ index, status, actual });
                continue;
            }

            if (!compareText(actual, expected)) {
                row.style.cssText += `;${DEFAULT_CONFIG.HIGHLIGHT_WRONG_STYLE}`;
                row.title = `❌ Index=${index}\nStatus=${status}\nExpected="${expected}"\nActual="${actual}"`;
                invalids.push({ index, status, expected, actual });
            }
        }
    }

    // =========================
    // Scroll loop
    // =========================
    let loops = 0;

    async function run() {
        // Đảm bảo check từ đầu list
        scrollEl.scrollTop = 0;

        // Đợi DOM update xong rồi validate viewport đầu tiên
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
            // Mỗi vòng scroll xuống bao nhiêu px
            scrollEl.scrollTop += SCROLL_STEP;

            // chờ virtual render row mới
            await sleep(SETTLE_MS);

            // validate các row mới render
            validateVisible();
        }

        // scroll đến đáy để chắc chắn
        scrollEl.scrollTop = scrollEl.scrollHeight;
        await sleep(SETTLE_MS);
        validateVisible();

        console.group(
            `%c[VirtualValidator] checked=${checkedIndices.size}/${apiList.length} wrong=${invalids.length} unknown=${unknowns.length}`,
            invalids.length ? "color:#ff3b30;font-weight:800;" : "color:#1a7f37;font-weight:800;"
        );
        console.log("Scroll container:", scrollEl);
        if (invalids.length) console.table(invalids);
        if (unknowns.length) console.table(unknowns);

        if (checkedIndices.size < apiList.length) {
            console.warn(
                `⚠️ Not all rows were checked. Checked=${checkedIndices.size}/${apiList.length}.
Possible reasons: rows don't have data-index, or row detection failed.`
            );
        }
        console.groupEnd();
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    run();

    // Tạo ra một chuỗi CSS selector sao cho bạn có thể dùng selector đó để tìm lại đúng element đó bằng document.querySelector(...).
    // Ví dụ output: html > body > div:nth-of-type(2) > ul > li:nth-of-type(3) > span

    // 3 việc chính:
    // - Đi từ element bạn đưa vào, đi ngược lên cha (parent)
    // - Mỗi bước, nó tạo ra selector cho element hiện tại:
    //      - Dùng tag name (div, span, tr...)
    //      - Nếu element có id → dùng luôn #id (vì id gần như unique)
    //      - Nếu không có id → thêm :nth-of-type(n) khi cần để phân biệt với anh em cùng tag
    function getCssPath(element) {
        if (!element || !(element instanceof Element)) return "";

        // Chứa các đoạn selector
        const path = [];

        // Loop chạy cho đến khi el = null (đến top) hoặc không phải element node
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase(); // Chính là các thẻ tagName (VD: "div", "span", "p",...)

            if (element.id) {
                // CSS.escape(...) để xử lý id có ký tự đặc biệt (: . [ ] …)
                selector += `#${CSS.escape(element.id)}`;
                // Add vào đầu mảng (vì bạn build từ con lên cha)
                path.unshift(selector);
                // selector có id đủ unique để tìm đúng rồi, quá đủ chính xác, không cần đi lên tới <html> nữa
                break;
            } else {
                // Lấy tất cả con trực tiếp của parent, sau đó lọc ra những thằng cùng tag name với element hiện tại
                const siblings = element.parentNode
                    ? Array.from(element.parentNode.children).filter((e) => e.nodeName === element.nodeName)
                    : [];

                // Nếu chỉ có 1 sibling cùng tag thì không cần nth-of-type
                if (siblings.length > 1) {
                    const index = siblings.indexOf(element) + 1;
                    selector += `:nth-of-type(${index})`;
                }
            }
            // Add vào đầu mảng (vì bạn build từ con lên cha). Trong khi ta đi từ con lên cha, ta lại muốn kết quả final là cha > con.
            path.unshift(selector);
            // đi lên 1 tầng và tiếp tục loop
            element = element.parentElement;
        }

        // join bằng > thành CSS path đầy đủ
        // VD: ["div:nth-of-type(2)", "ul", "li:nth-of-type(3)", "span"] => div:nth-of-type(2) > ul > li:nth-of-type(3) > span
        return path.join(" > ");
    }
})();
