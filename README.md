# Codex API Dashboard

本地 Codex 额度看板，基于 CLIProxyAPI 的 Management API 查询 Codex OAuth 账号的 5h 和 Weekly 剩余额度。

## 本地运行

先启动 CLIProxyAPI，并确保 Management API 可用。默认地址是 `http://127.0.0.1:8317`。

复制 `.env.example` 为 `.env`，并填写 Management Key:

```bash
cp .env.example .env
```

```bash
npm start
```

打开 `http://127.0.0.1:3456`，填写 CPA 地址和 Management Key，然后点击保存。

## OAuth 授权

点击页面里的 `OAuth` 按钮后，会调用 CLIProxyAPI:

```text
GET /v0/management/codex-auth-url?is_webui=1
```

CLIProxyAPI 会打开 Codex OAuth 流程并在本机使用回调端口 `1455`。授权成功后账号会出现在:

```text
GET /v0/management/auth-files
```

## 额度查询

每个 Codex 账号会通过 CLIProxyAPI 的代发接口查询:

```text
POST /v0/management/api-call
```

实际上游地址:

```text
https://chatgpt.com/backend-api/wham/usage
```

请求头会包含:

```text
Authorization: Bearer $TOKEN$
Chatgpt-Account-Id: <chatgpt_account_id>
```

其中 `$TOKEN$` 由 CLIProxyAPI 根据 `auth_index` 自动替换。

## 环境变量

项目启动时会自动读取根目录 `.env` 文件，支持 `management_key`、`managementkey` 或 `MANAGEMENT_KEY`:

```bash
PORT=3456
HOST=127.0.0.1
CPA_BASE_URL=http://127.0.0.1:8317
management_key=your-management-key
```

页面保存的配置位于 `data/config.json`，该文件已加入 `.gitignore`。

## Linux 部署

复制整个目录到服务器后:

```bash
cd /path/to/api-dashboard
PORT=3456 HOST=127.0.0.1 CPA_BASE_URL=http://127.0.0.1:8317 MANAGEMENT_KEY=your-key npm start
```

systemd 示例:

```ini
[Unit]
Description=Codex API Dashboard
After=network.target

[Service]
WorkingDirectory=/opt/api-dashboard
ExecStart=/usr/bin/node server.mjs
Environment=PORT=3456
Environment=HOST=127.0.0.1
Environment=CPA_BASE_URL=http://127.0.0.1:8317
Environment=MANAGEMENT_KEY=your-management-key
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

如果在远程 Linux 上新增 OAuth，注意 Codex OAuth 的回调默认使用运行 CLIProxyAPI 的机器上的 `1455` 端口。常见做法是在本地完成 OAuth 后同步 CLIProxyAPI 的 `auths/*.json`，或用 SSH 端口转发配合授权。
