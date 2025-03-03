export default {
  async fetch(request, env) {
    const KV_NAMESPACE = "YOUR_KV_NAMESPACE"; // KV 存储的命名空间，需要手动配置
    const KV = env[KV_NAMESPACE]; // 绑定 KV 存储
    const url = new URL(request.url);

    // 处理不同的 API 路径
    if (request.method === "GET" && url.pathname === "/upload") {
      return handleUploadPage(); // 返回上传页面
    }
    if (request.method === "POST" && url.pathname === "/upload") {
      return handleUpload(request, KV); // 处理上传请求
    }
    if (request.method === "GET" && url.pathname === "/download") {
      return handleDownloadPage(); // 返回下载页面
    }
    if (request.method === "POST" && url.pathname === "/fetch-file") {
      return handleFetchFile(request, KV); // 处理下载请求
    }
    return new Response("Not Found", { status: 404 }); // 处理未知路径
  }
};

// 上传页面 HTML
function handleUploadPage() {
  return new Response(`
    <html>
      <body>
        <h2>上传文件</h2>
        <input type="file" id="fileInput" />
        <button onclick="uploadFile()">上传</button>
        <p id="result"></p>
        <script>
          async function uploadFile() {
            const fileInput = document.getElementById("fileInput");
            if (!fileInput.files.length) {
              alert("请选择文件");
              return;
            }
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.readAsDataURL(file); // 读取文件并转换为 Base64
            reader.onload = async function () {
              const base64 = reader.result.split(",")[1]; // 提取 Base64 数据部分
              const response = await fetch("/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, base64 })
              });
              const data = await response.json();
              document.getElementById("result").textContent = "取件码: " + data.pickupCode; // 显示取件码
            };
          }
        </script>
      </body>
    </html>
  `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// 处理上传请求
async function handleUpload(request, KV) {
  const { filename, base64 } = await request.json();
  if (!filename || !base64) {
    return new Response("Invalid request", { status: 400 }); // 返回错误
  }

  const pickupCode = generateCode(); // 生成取件码
  const fileKey = generateCode(); // 生成文件存储键

  await KV.put(fileKey, base64); // 存储文件 Base64 数据到 KV

  // 更新索引数据
  let indexData = await KV.get("index", { type: "json" }) || {};
  indexData[pickupCode] = [filename, fileKey];
  await KV.put("index", JSON.stringify(indexData));

  return new Response(JSON.stringify({ pickupCode }), { headers: { "Content-Type": "application/json" } });
}

// 处理下载请求
async function handleFetchFile(request, KV) {
  const { pickupCode } = await request.json();
  const indexData = await KV.get("index", { type: "json" });
  if (!indexData || !indexData[pickupCode]) {
    return new Response(JSON.stringify({ error: "取件码错误" }), { status: 400 });
  }

  const [filename, fileKey] = indexData[pickupCode];
  const fileBase64 = await KV.get(fileKey); // 读取文件内容

  return new Response(JSON.stringify({ filename, fileBase64 }), { headers: { "Content-Type": "application/json" } });
}

// 下载页面 HTML
function handleDownloadPage() {
  return new Response(`
    <html>
      <body>
        <h2>下载文件</h2>
        <input type="text" id="code" placeholder="输入取件码" />
        <button onclick="downloadFile()">下载</button>
        <p id="error" style="color: red;"></p>
        <script>
          async function downloadFile() {
            const code = document.getElementById("code").value;
            const response = await fetch("/fetch-file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pickupCode: code })
            });
            const data = await response.json();
            if (data.error) {
              document.getElementById("error").textContent = data.error;
              return;
            }
            // 将 Base64 转换为 Blob 并下载
            const byteCharacters = atob(data.fileBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/octet-stream" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = data.filename;
            link.click();
          }
        </script>
      </body>
    </html>
  `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// 生成 5 位随机取件码
function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}
