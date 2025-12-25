(() => {
    // =========================
    // CONFIG
    // =========================

    const CONFIG = {
        API_URL: "api/v1/logic/search/negot-car-list",

        ITEM_SELECTOR: ".price",

        TEXT_SELECTOR: ".price",

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

        COMPARE_MODE: "contains", // "exact" | "contains"

        HIGHLIGHT_WRONG_STYLE:
            "outline: 3px solid #ff3b30; box-shadow: 0 0 0 4px rgba(255,59,48,0.2); border-radius: 10px;",

        HIGHLIGHT_UNKNOWN_STYLE:
            "outline: 3px solid #ff9500; box-shadow: 0 0 0 4px rgba(255,149,0,0.18); border-radius: 10px;",
    };

    // Làm sạch text UI để so sánh ổn định
    const normalize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

    const compareText = (actual = "", expected = "") => {
        if (CONFIG.COMPARE_MODE === "exact") return actual?.trim() === expected?.trim();
        return actual?.trim().includes(expected?.trim());
    };

    // =========================
    // 1) Get captured API
    // =========================
    const captured = window.__capturedApi__ || [];
    if (!captured.length) {
        console.warn("❌ Chưa có captured API. Hãy chạy snippet capture trước rồi reload.");
        return;
    }

    // [...captured] clone array (để không mutate captured gốc)
    // .reverse() đảo ngược → mới nhất lên đầu
    // .find(...) lấy cái đầu tiên match condition, tức là request mới nhất phù hợp
    const target =
        [...captured]
            .reverse()
            .find((x) => (x.url || "").includes(CONFIG.API_URL));

    if (!target) {
        console.warn(`❌ Không tìm thấy API url chứa "${CONFIG.API_URL}".`);
        console.log("Captured urls:", captured.map((x) => x.url));
        return;
    }

    // =========================
    // 2) Extract list array
    // =========================
    function getListFromJson(json) {
        if (Array.isArray(json)) return json;
        if (Array.isArray(json?.items)) return json.items;
        if (Array.isArray(json?.data)) return json.data;
        if (Array.isArray(json?.data?.items)) return json.data.items;
        if (Array.isArray(json?.data?.list)) return json.data.list;
        return [];
    }

    const apiList = getListFromJson(target.json);
    if (!apiList.length) {
        console.warn("❌ Không lấy được list từ JSON. Bạn sửa getListFromJson().");
        console.log("Captured json:", target.json);
        return;
    }

    // CHECK AGAIN
    function getStatusCode(item) {
        return Number(item.status); // chỉnh field status ở đây
    }

    // =========================
    // 3) Read DOM list
    // =========================
    const listItemData = Array.from(document.querySelectorAll(CONFIG.ITEM_SELECTOR));
    if (!listItemData.length) {
        console.warn(`❌ Không tìm thấy DOM items với selector "${CONFIG.ITEM_SELECTOR}".`);
        return;
    }

    // =========================
    // 4) Compare by index
    // =========================
    // Phải dùng Math.min vì:
    // - Nếu apiList dài hơn listItemData (pagination/virtual list): listItemData[i] sẽ undefined nếu i vượt length → crash ứng dụng
    // - Nếu listItemData (pagination/virtual list) dài hơn apiList: apiList[i] sẽ undefined nếu i vượt length → crash ứng dụng
    const len = Math.min(apiList.length, listItemData.length);

    // item có mapping nhưng text hiển thị sai
    const invalids = [];

    // item có status code mà mapping không định nghĩa (hoặc status NaN)
    const unknowns = [];

    for (let i = 0; i < len; i++) {
        const apiItem = apiList[i];
        const domItem = listItemData[i];

        const status = getStatusCode(apiItem);
        const expected = CONFIG.MAPPING[status];

        const textEl = domItem.querySelector(CONFIG.TEXT_SELECTOR);
        const actual = normalize(textEl?.innerText || textEl?.textContent || "");

        if (!expected) {
            domItem.style.cssText += `;${CONFIG.HIGHLIGHT_UNKNOWN_STYLE}`;
            domItem.title = `⚠️ No MAPPING for status=${status} (index=${i})`;
            unknowns.push({ index: i, status, actual });
            continue;
        }

        if (!compareText(actual, normalize(expected))) {
            domItem.style.cssText += `;${CONFIG.HIGHLIGHT_WRONG_STYLE}`;
            domItem.title = `❌ Index=${i}\nStatus=${status}\nExpected="${expected}"\nActual="${actual}"`;

            invalids.push({
                index: i,
                status,
                expected,
                actual,
                selector: getCssPath(domItem),
            });
        }
    }

    // =========================
    // Report
    // =========================
    console.group(
        `%c[IndexValidator] Compare by index: checked=${len} | wrong=${invalids.length} | unknown=${unknowns.length}`,
        invalids.length ? "color:#ff3b30;font-weight:800;" : "color:#1a7f37;font-weight:800;"
    );
    console.log("Captured API url:", target.url);
    console.log("API length:", apiList.length, "| DOM length:", listItemData.length);

    if (apiList.length !== listItemData.length) {
        console.warn(
            `⚠️ Length mismatch: API=${apiList.length}, DOM=${listItemData.length}. Snippet chỉ check ${len} item theo index.\n` +
            `→ Nếu UI pagination/virtual list, bạn nên dùng distribution validator hoặc lọc đúng API page.`
        );
    }

    if (invalids.length) {
        console.group(`❌ Wrong items (${invalids.length})`);
        console.table(invalids);
        console.groupEnd();
    } else {
        console.log("%c✅ All checked items matched", "color:#1a7f37;font-weight:700;");
    }

    if (unknowns.length) {
        console.group(`⚠️ Unknown MAPPING (${unknowns.length})`);
        console.table(unknowns);
        console.groupEnd();
    }

    console.groupEnd();

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
