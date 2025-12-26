(() => {
    // =========================
    // CONFIG
    // =========================
    const CONFIG = {
        API_JSON: {
            DATA: {
            }
        },

        ITEM_SELECTOR: ".price",

        MAPPING: {
            101: "即決落札可",
            102: "成約",
            103: "キャンセル",
            201: "商談受付中",
            202: "他社商談中",
            203: "商談申込済",
            204: "自社商談中",
            205: "成約",
            206: "商談受付中",
            207: "商談受付中",
            208: "商談受付中",
            209: "商談成約",
            210: "商談成約",
            301: "仮出品",
            302: "未セリ",
            303: "成約",
            304: "流れ",
            305: "出品取消",
            306: "キャンセル",
            307: "成約",
            308: "成約",
            401: "商談受付中",
            402: "他社商談中",
            403: "商談申込済",
            404: "自社商談中",
            405: "商談成約",
            406: "商談受付中",
            407: "商談キャンセル",
            408: "受付終了",
            409: "商談不可",
            410: "商談受付中",
            411: "商談成約",
            412: "商談成約",
        },

        // Phương thức này sẽ extract list được lấy từ response api
        GET_LIST_FROM_JSON: (json) => json?.DATA?.CAR_LIST || [],

        // Phương thức này sẽ lấy ra data của field tương ứng từ response api
        GET_PATTERN_FIELD: (apiItem) => Number(apiItem.STATUS),

        SCROLL_CONTAINER_SELECTOR: null,

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
        SETTE_MS: 120,

        // Giới hạn để tránh infinite loop nếu scroll container lạ
        MAX_LOOP: 300,
    };

    const normalize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

    const compareText = (actual = "", expected = "") => {
        if (CONFIG.COMPARE_MODE === "exact") return actual?.trim() === expected?.trim();
        return actual?.trim().includes(expected?.trim());
    };

    // =========================
    // Extract list array
    // =========================
    // const apiList = GET_LIST_FROM_JSON(API_JSON);
    const apiList = CONFIG.GET_LIST_FROM_JSON(CONFIG.API_JSON);
    if (!apiList.length) {
        console.warn("❌ Không lấy được list từ JSON. Vui lòng kiểm tra lại data của bạn.");
        console.log("DATA JSON:", CONFIG.API_JSON);
        return;
    }

    // =========================
    // Read DOM list
    // =========================
    const listItemData = Array.from(document.querySelectorAll(CONFIG.ITEM_SELECTOR));
    if (!listItemData.length) {
        console.warn(`❌ Không tìm thấy DOM items với selector "${CONFIG.ITEM_SELECTOR}".`);
        return;
    }

    // =========================
    // Detect scroll container
    // =========================
    function findScrollContainer() {
        if (CONFIG.SCROLL_CONTAINER_SELECTOR) {
            return document.querySelector(CONFIG.SCROLL_CONTAINER_SELECTOR);
        }

        // Tìm 1 cell bất kỳ có ITEM_SELECTOR
        const anyCell = document.querySelector(CONFIG.ITEM_SELECTOR);
        if (!anyCell) return null;

        // Đi lên cha (parent) cho đến khi gặp element có thể scroll
        let el = anyCell.parentElement;
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

    const scrollEl = findScrollContainer();
    if (!scrollEl) {
        console.warn("❌ Cannot find scroll container. Set CONFIG.SCROLL_CONTAINER_SELECTOR manually.");
        return;
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
        const cells = Array.from(scrollEl.querySelectorAll(CONFIG.ITEM_SELECTOR));
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
        // Try data-index
        const attr = CONFIG.ROW_INDEX_ATTR;

        // row có data-index="12" → index=12
        // row có data-row-index="0" → index=0
        if (attr) {
            const value = row.getAttribute(attr);
            if (value != null && value !== "") return Number(value);
        }

        // fallback: try any data-index-like attribute
        for (const name of ["data-index", "data-row-index", "data-virtual-index"]) {
            const v = row.getAttribute(name);
            if (v != null && v !== "") return Number(v);
        }

        // Nếu không có index attr → return null → row đó bị skip.
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

            const status = CONFIG.GET_PATTERN_FIELD(apiItem);
            const expected = normalize(CONFIG.MAPPING[status]);

            const cell = row.querySelector(CONFIG.ITEM_SELECTOR) || row;
            const actual = normalize(cell.innerText || cell.textContent || "");

            if (!expected) {
                row.style.cssText += `;${CONFIG.HIGHLIGHT_UNKNOWN_STYLE}`;
                row.title = `⚠️ No mapping for status=${status} (index=${index})`;
                unknowns.push({ index, status, actual });
                continue;
            }

            if (!compareText(actual, expected)) {
                row.style.cssText += `;${CONFIG.HIGHLIGHT_WRONG_STYLE}`;
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
        await sleep(CONFIG.SETTE_MS);
        validateVisible();

        while (
            // + Không vượt quá maxLoops
            loops++ < CONFIG.MAX_LOOP &&
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
            scrollEl.scrollTop += CONFIG.SCROLL_STEP;

            // chờ virtual render row mới
            await sleep(CONFIG.SETTE_MS);

            // validate các row mới render
            validateVisible();
        }

        // scroll đến đáy để chắc chắn
        scrollEl.scrollTop = scrollEl.scrollHeight;
        await sleep(CONFIG.SETTE_MS);
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
