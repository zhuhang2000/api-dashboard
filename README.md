# Codex API Dashboard & Fail2ban 安全管理看板

这是一个轻量、现代且模块化的 API 监控与安全防御看板，主要包含两大核心功能：
1. **Codex 额度看板**：基于 CLIProxyAPI 的 Management API 查询 Codex OAuth 账号的 5h 和 Weekly 剩余额度与重置时间；
2. **Fail2ban IP 安全管理**：带有密码保护的安全控制台，支持实时查看被拦截的 IP 列表、统计指标、手动封禁指定 IP、解封单个 IP 以及一键解封所有规则下的 IP。

---

## 1. 核心功能与特性

### 1.1 Codex 额度监控
- **实时额度计算**：精确计算并展示 5 小时限额（5h）与周限额（Weekly）的剩余百分比及重置时间；
- **状态推导**：根据额度剩余情况自动标示可用（Ready）、低额度（Low）、耗尽（Exhausted）或异常（Error）状态；
- **一键刷新**：支持单账号或全量并发刷新。

### 1.2 Fail2ban IP 安全防御控制台
- **密码鉴权保护**：默认处于安全锁定状态，需输入管理员密码（`ADMIN_PASSWORD`）解锁；支持随时一键重新锁定；
- **拦截统计与 IP 列表**：实时读取 `cliproxy-401` 规则下的当前封禁 IP 数、累计拦截次数及失败尝试数；
- **手动封禁 IP**：输入 IPv4 或 IPv6 地址，联动 Fail2ban 执行封禁：
  ```bash
  fail2ban-client set cliproxy-401 banip <IP地址>
  ```
- **解封单个 IP**：在封禁列表中一键解封指定 IP：
  ```bash
  fail2ban-client set cliproxy-401 unbanip <IP地址>
  ```
- **一键解封所有 IP**：带有防误触二次确认，一键清除所有规则下的封禁：
  ```bash
  fail2ban-client unban --all
  ```

---

## 2. 项目目录架构

项目采用严格的全栈模块化设计，前后端逻辑完全解耦：

```
/opt/services/api-dashboard/
├── server.mjs                        # 后端轻量主入口（~25 行）
├── backend/                          # 后端业务分层模块
│   ├── config.mjs                    # 配置中心与环境变量严格校验
│   ├── services/
│   │   ├── codex-quota.mjs           # Codex 账号与 Wham 额度查询服务
│   │   └── fail2ban.mjs              # Fail2ban 命令封装与 IP 安全管理
│   ├── middleware/
│   │   └── auth.mjs                  # 管理员 Bearer Token 鉴权中间件
│   ├── routes/
│   │   ├── api.mjs                   # API 路由分发器
│   │   └── static.mjs                # 静态资源安全托管
│   └── utils/
│       └── http.mjs                  # HTTP 响应封装与 Body 解析工具
└── front/                            # 前端组件化静态资源
    ├── index.html                    # 纯净宿主骨架页面
    ├── styles.css                    # 全局公共样式（设计变量、按钮、通用网格）
    ├── dashboard/                    # Codex 额度看板独立组件
    │   ├── dashboard.html            # 看板独立 HTML 结构与卡片模板
    │   ├── dashboard.js              # 看板渲染与交互控制器
    │   └── dashboard.css             # 账户卡片与进度条专属样式
    └── security-manager/             # Fail2ban IP 安全管理独立组件
        ├── security-manager.html     # 安全管理 HTML 结构与视图模板
        ├── security-manager.js       # 安全管理鉴权与 Fail2ban 交互控制器
        └── security-manager.css      # 安全操作栏与 IP 表格专属样式
```

---

## 3. 环境变量配置 (`.env`)

复制 `.env.example` 为 `.env` 并填写对应参数：

```bash
cp .env.example .env
```

`.env` 配置文件说明：

```ini
# 服务监听配置
PORT=3456
HOST=127.0.0.1

# CPA 代理服务地址与管理密钥
CPA_BASE_URL=http://127.0.0.1:8317
MANAGEMENT_KEY=your-management-key

# 安全管理模块解锁密码
ADMIN_PASSWORD=your-admin-password
```

> **注意**：系统在启动时会对上述 5 个必要字段进行严格校验，若有缺失将抛出异常提示。

---

## 4. 本地运行与开发

```bash
# 启动生产服务
npm start

# 启动开发监听服务
npm run dev
```

启动后访问 `http://127.0.0.1:3456` 即可打开看板。

---

## 5. 后端 API 接口清单

| 接口路径 | 方法 | 鉴权要求 | 说明 |
| :--- | :--- | :--- | :--- |
| `/api/quotas/refresh` | `POST` | 无 | 刷新所有 Codex 账号额度 |
| `/api/admin/verify` | `POST` | 密码校验 | 验证管理员密码并返回鉴权结果 |
| `/api/admin/fail2ban/status` | `GET` | `Bearer Token` | 获取 Fail2ban 统计指标与封禁 IP 列表 |
| `/api/admin/fail2ban/ban` | `POST` | `Bearer Token` | 封禁指定 IP (`{ "ip": "x.x.x.x" }`) |
| `/api/admin/fail2ban/unban` | `POST` | `Bearer Token` | 解封指定 IP (`{ "ip": "x.x.x.x" }`) |
| `/api/admin/fail2ban/unban-all` | `POST` | `Bearer Token` | 一键解封所有规则下的 IP |

---

## 6. Linux 生产部署 (Systemd)

Systemd 服务配置文件示例（`/etc/systemd/system/api-dashboard.service`）：

```ini
[Unit]
Description=Codex API Dashboard
After=network.target

[Service]
WorkingDirectory=/opt/services/api-dashboard
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

启动与管理命令：

```bash
# 重载服务配置并重启
systemctl daemon-reload
systemctl restart api-dashboard.service

# 查看服务运行状态
systemctl status api-dashboard.service
```
