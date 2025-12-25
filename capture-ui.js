(() => {
    // Nếu đã cài rồi thì warn và stop. Nếu chưa cài thì set flag = true và tiếp tục
    if (window.__API_CAPTURE_INSTALLED__) {
        console.warn("[API CAPTURE] already installed");
        return;
    }

    // Biến global __API_CAPTURE_INSTALLED__ để đánh dấu là đã cài rồi
    window.__API_CAPTURE_INSTALLED__ = true;

    // Nếu trước đó đã có __capturedApi__ (bạn capture từ trước) thì giữ lại. Nếu chưa có thì tạo mảng rỗng
    // window.__capturedApi__ là kho log JSON response
    window.__capturedApi__ = window.__capturedApi__ || [];

    // push data vào kho log
    const pushCapture = (payload) => {
        // Mỗi lần capture được 1 response JSON, nó thêm:
        // - time: thời điểm capture
        // - payload: phần info cụ thể của request/response
        window.__capturedApi__.push({
            time: new Date().toISOString(),
            ...payload,
        });

        // shift() xoá phần tử đầu tiên (cũ nhất)
        // Mục đích: tránh memory leak nếu app gọi quá nhiều request
        // Luôn giữ 50 requests gần nhất
        if (window.__capturedApi__.length > 50) window.__capturedApi__.shift();
    };

    // Lưu lại fetch gốc. Nếu bạn không lưu lại, bạn sẽ mất fetch gốc và không thể gọi request thật nữa.
    const originalFetch = window.fetch;

    // Mọi chỗ trong app gọi fetch(...) sẽ chạy vào wrapper này
    // Wrapper gọi originalFetch(...) để request vẫn chạy như bình thường
    // Sau khi có response (res) → nó clone và parse JSON để capture

    window.fetch = async (...args) => {
        // Nếu input là string thì url = input, nếu input là object thì url = input.url
        // init là options (method, headers, body, …)
        const [input, init] = args;

        const url = typeof input === "string" ? input : input?.url;

        // Request thật chạy và trả response
        const res = await originalFetch(...args);
        try {
            // Phải clone() vì:
            // + Response body của fetch là stream, chỉ đọc được 1 lần
            // + Nếu bạn gọi res.json() trực tiếp trong snippet:
            //  - Bạn sẽ ăn mất body
            //  - Code app sau đó không đọc được nữa
            //  - App sẽ lỗi
            const cloned = res.clone();
            const contentType = cloned.headers.get("content-type") || "";

            // Chỉ khi response là JSON mới parse. Chỉ capture JSON thôi. Tránh parse file download, blob, html… 
            if (contentType.includes("application/json")) {
                // JSON được parse thành object JS
                const json = await cloned.json();

                // Lưu vào captured

                // type: "fetch" → marker đây là request từ fetch
                // url → url bạn vừa lấy
                // method → từ init.method nếu có, không có thì mặc định GET
                // (fetch mặc định GET)
                // status → HTTP status code (200, 404, 500…)
                // json → response JSON thật

                pushCapture({
                    type: "fetch",
                    url,
                    method: init?.method || "GET",
                    status: res.status,
                    json,
                });

                // %c là format để apply CSS style cho log
                console.log("%c[API CAPTURE][fetch]", "color:#0b5fff;font-weight:700;", url);
            }
        } catch { }

        // Return response để app dùng bình thường
        // Rất quan trọng: wrapper fetch phải return response gốc, để app xử lý như bình thường.
        return res;
    };

    // Intercept XMLHttpRequest (XHR): 
    // Phần này dùng để bắt:
    // - axios (đa số axios browser dùng XHR)
    // - hoặc code cũ dùng XHR trực tiếp

    // Lưu open/send gốc. Để gọi lại hành vi gốc, không phá app
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    // - open(method, url) là bước XHR set up request
    // - Ở đây snippet lưu method và url vào this (chính là instance XHR)
    // + Tại sao lưu vào this?
    //      - Vì đến lúc load event (khi response về), bạn cần biết request là url nào/method nào
    //      - Nếu không lưu, lúc load khó truy ra URL
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__cap_method = method;
        this.__cap_url = url;

        // Sau đó gọi open gốc bằng: originalOpen.call(this, method, url, ...rest)
        return originalOpen.call(this, method, url, ...rest);
    };

    // send() là bước request được gửi đi.
    // - Gắn listener load để chờ response về
    // - Gọi send gốc để request chạy bình thường
    XMLHttpRequest.prototype.send = function (...args) {
        // load chạy khi request hoàn tất thành công về mặt network (response nhận xong)
        // Nó chạy dù status là 200 hay 404 (miễn response được nhận)
        this.addEventListener("load", function () {
            try {
                // this trong load callback chính là XHR instance
                const contentType = this.getResponseHeader("content-type") || "";

                if (contentType.includes("application/json")) {
                    // parse bằng JSON.parse
                    const json = JSON.parse(this.responseText);

                    // type = xhr
                    // url = url đã lưu từ open()
                    // method = method đã lưu từ open()
                    // status = this.status
                    // json = JSON parsed

                    pushCapture({
                        type: "xhr",
                        url: this.__cap_url,
                        method: this.__cap_method,
                        status: this.status,
                        json,
                    });

                    console.log("%c[API CAPTURE][xhr]", "color:#0b5fff;font-weight:700;", this.__cap_url);
                }
            } catch { }
        });
        
        // apply vì args là array.
        return originalSend.apply(this, args);
    };
    console.log("%c✅ API Capture installed. Now reload page. Use window.__capturedApi__ to inspect.", "color:#1a7f37;font-weight:700;");
})();