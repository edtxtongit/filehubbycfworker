export default {
  async fetch(request, env) {
    const KV_NAMESPACE = "YOUR_KV_NAMESPACE"; // KV �洢�������ռ䣬��Ҫ�ֶ�����
    const KV = env[KV_NAMESPACE]; // �� KV �洢
    const url = new URL(request.url);

    // ����ͬ�� API ·��
    if (request.method === "GET" && url.pathname === "/upload") {
      return handleUploadPage(); // �����ϴ�ҳ��
    }
    if (request.method === "POST" && url.pathname === "/upload") {
      return handleUpload(request, KV); // �����ϴ�����
    }
    if (request.method === "GET" && url.pathname === "/download") {
      return handleDownloadPage(); // ��������ҳ��
    }
    if (request.method === "POST" && url.pathname === "/fetch-file") {
      return handleFetchFile(request, KV); // ������������
    }
    return new Response("Not Found", { status: 404 }); // ����δ֪·��
  }
};

// �ϴ�ҳ�� HTML
function handleUploadPage() {
  return new Response(`
    <html>
      <body>
        <h2>�ϴ��ļ�</h2>
        <input type="file" id="fileInput" />
        <button onclick="uploadFile()">�ϴ�</button>
        <p id="result"></p>
        <script>
          async function uploadFile() {
            const fileInput = document.getElementById("fileInput");
            if (!fileInput.files.length) {
              alert("��ѡ���ļ�");
              return;
            }
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.readAsDataURL(file); // ��ȡ�ļ���ת��Ϊ Base64
            reader.onload = async function () {
              const base64 = reader.result.split(",")[1]; // ��ȡ Base64 ���ݲ���
              const response = await fetch("/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, base64 })
              });
              const data = await response.json();
              document.getElementById("result").textContent = "ȡ����: " + data.pickupCode; // ��ʾȡ����
            };
          }
        </script>
      </body>
    </html>
  `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// �����ϴ�����
async function handleUpload(request, KV) {
  const { filename, base64 } = await request.json();
  if (!filename || !base64) {
    return new Response("Invalid request", { status: 400 }); // ���ش���
  }

  const pickupCode = generateCode(); // ����ȡ����
  const fileKey = generateCode(); // �����ļ��洢��

  await KV.put(fileKey, base64); // �洢�ļ� Base64 ���ݵ� KV

  // ������������
  let indexData = await KV.get("index", { type: "json" }) || {};
  indexData[pickupCode] = [filename, fileKey];
  await KV.put("index", JSON.stringify(indexData));

  return new Response(JSON.stringify({ pickupCode }), { headers: { "Content-Type": "application/json" } });
}

// ������������
async function handleFetchFile(request, KV) {
  const { pickupCode } = await request.json();
  const indexData = await KV.get("index", { type: "json" });
  if (!indexData || !indexData[pickupCode]) {
    return new Response(JSON.stringify({ error: "ȡ�������" }), { status: 400 });
  }

  const [filename, fileKey] = indexData[pickupCode];
  const fileBase64 = await KV.get(fileKey); // ��ȡ�ļ�����

  return new Response(JSON.stringify({ filename, fileBase64 }), { headers: { "Content-Type": "application/json" } });
}

// ����ҳ�� HTML
function handleDownloadPage() {
  return new Response(`
    <html>
      <body>
        <h2>�����ļ�</h2>
        <input type="text" id="code" placeholder="����ȡ����" />
        <button onclick="downloadFile()">����</button>
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
            // �� Base64 ת��Ϊ Blob ������
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

// ���� 5 λ���ȡ����
function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}
