# Codex API Dashboard & Fail2ban 安全管理看板

这是一个轻量、现代且模块化的 API 监控与安全防御看板，主要包含两大核心功能：
1. **Codex 额度看板**：基于 CLIProxyAPI 的 Management API 查询 Codex OAuth 账号的 5h 和 Weekly 剩余额度与重置时间；
2. **Fail2ban 安全管理与 IP 分析控制台**：带有防暴力破解保护的独立管理控制台，支持实时拦截指标统计、被封禁 IP 管理，以及联动 Python 日志分析脚本呈现 IP 请求频次排行榜并支持快捷封禁。

---

## 1. 核心功能与特性

### 1.1 Codex 额度监控
- **实时额度计算**：精确计算并展示 5 小时限额（5h）与周限额（Weekly）的剩余百分比及重置时间；
- **状态推导**：根据额度剩余情况自动标示可用（Ready）、低额度（Low）、耗尽（Exhausted）或异常（Error）状态；
- **一键刷新**：支持单账号或全量并发刷新。

### 1.2 安全控制台与防暴力破解 (Login Guard)
- **弹窗鉴权 & 独立全屏展示**：主页右上角提供「控制台」入口，点击弹出居中密码验证框，解锁后无缝切换至全屏独立的控制台页面；
- **防暴力破解（Anti-Bruteforce）**：
  - 自动提取 Nginx 转发的真实客户端 IP（`X-Real-IP` / `X-Forwarded-For`）；
  - 密码输入错误时实时提醒剩余尝试次数；
  - 15 分钟内连续输错 **5 次**，系统自动联动 Fail2ban 将该客户端 IP 实施系统级临时封禁；
  - 本地回路地址（`127.0.0.1` / `::1`）受白名单保护防自锁。
- **Fail2ban 拦截管理**：
  - 实时读取 `cliproxy-401` 规则下的当前封禁 IP 数、累计拦截次数及失败尝试数；
  - 手动封禁 IP：`fail2ban-client set cliproxy-401 banip <IP>`；
  - 单 IP 解封：`fail2ban-client set cliproxy-401 unbanip <IP>`；
  - 一键解封所有规则下的 IP：`fail2ban-client unban --all`。

### 1.3 日志 IP 请求频次统计与快捷封禁
- **联动 Python 脚本**：一键调用 `/opt/services/cli-proxy/logs/count_ips.py` 扫描分析日志；
- **结构化榜单与指标**：结构化展示独立 IP 数、总请求行数、时间区间与排行榜单；
- **可视化排版**：前三名金银铜高光徽标、流量占比百分比进度条及 IPv4 / IPv6 协议标签；
- **快捷联动封禁**：自动标识已封禁 IP；对高频未封禁 IP 支持一键快捷封禁。

---

## 2. 项目目录架构

项目采用严格的全栈模块化设计，前后端逻辑解耦：

```
/opt/services/api-dashboard/
├── server.mjs                        # 后端轻量主入口
├── backend/                          # 后端业务分层模块
│   ├── config.mjs                    # 配置中心与环境变量严格校验
│   ├── services/
│   │   ├── codex-quota.mjs           # Codex 账号与 Wham 额度查询服务
│   │   ├── fail2ban.mjs              # Fail2ban 命令封装与 IP 安全管理
│   │   ├── ip-analyzer.mjs           # Python 日志统计脚本调用与解析
│   │   └── login-guard.mjs           # 控制台防暴力破解与自动封禁
│   ├── middleware/
│   │   └── auth.mjs                  # 管理员 Bearer Token 鉴权中间件
│   ├── routes/
│   │   ├── api.mjs                   # API 路由分发器
│   │   └── static.mjs                # 静态资源安全托管
│   └── utils/
│       └── http.mjs                  # HTTP 响应封装与 Body 解析工具
└── front/                            # 前端（Vue 3 原生 ESM，免构建）
    ├── index.html                    # 宿主页面（importmap + 样式入口）
    ├── main.js                       # 根组件与 hash 视图切换
    ├── services/                     # 数据层（不可命名为 api/，会与后端 /api/ 路由前缀冲突）
    │   ├── http.js                   # requestJson 与受保护请求封装（Bearer 注入、401 清除凭证）
    │   ├── auth.js                   # 管理员认证状态响应式单例（token / 失效原因）
    │   ├── quotas.js                 # Codex 额度接口
    │   └── admin.js                  # 控制台验证与 Fail2ban / IP 统计接口
    ├── common/                       # 共享层：仅放被多个视图使用的通用能力
    │   ├── styles.css                # 全局样式与设计令牌
    │   ├── toast.js / toast.css      # 全局 Toast 提示（逻辑与样式成对）
    │   ├── datetime.js               # 时间格式化
    │   ├── clipboard.js              # 剪贴板复制
    │   ├── template.js               # 组件 HTML 模板加载
    │   └── vendor/                   # 离线 Vue 3 ESM 运行时
    ├── dashboard/                    # Codex 额度看板视图
    │   ├── dashboard.html            # 看板模板
    │   ├── dashboard.js              # DashboardView 组件
    │   ├── dashboard.css             # 账户卡片与进度条样式
    │   └── format.js                 # 套餐 / 限额标签 / 剩余百分比等格式化
    └── security-manager/             # Fail2ban 安全控制台视图
        ├── security-manager.html     # 控制台与密码弹窗模板
        ├── security-manager.js       # SecurityView 组件
        └── security-manager.css      # 弹窗、卡片、表格与排行榜样式
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

# CPA 代理服务地址与统一管理密钥（同时作为安全管理控制台解锁密钥）
CPA_BASE_URL=http://127.0.0.1:8317
MANAGEMENT_KEY=your-management-key
```

---

## 4. 后端 API 接口与语义错误码

### 4.1 API 接口清单

| 接口路径 | 方法 | 鉴权要求 | 说明 |
| :--- | :--- | :--- | :--- |
| `/api/quotas/refresh` | `POST` | 无 | 刷新所有 Codex 账号额度 |
| `/api/admin/verify` | `POST` | 密码校验 | 验证管理员密码（输错 5 次自动触发 IP 封禁） |
| `/api/admin/fail2ban/status` | `GET` | `Bearer Token` | 获取 Fail2ban 统计指标与封禁 IP 列表 |
| `/api/admin/fail2ban/ban` | `POST` | `Bearer Token` | 封禁指定 IP (`{ "ip": "x.x.x.x" }`) |
| `/api/admin/fail2ban/unban` | `POST` | `Bearer Token` | 解封指定 IP (`{ "ip": "x.x.x.x" }`) |
| `/api/admin/fail2ban/unban-all` | `POST` | `Bearer Token` | 一键解封所有规则下的 IP |
| `/api/admin/ip-stats/run` | `POST` | `Bearer Token` | 执行 Python 脚本分析最新 IP 请求频次 |
| `/api/admin/ip-stats/latest` | `GET` | `Bearer Token` | 获取最近一次 IP 请求频次统计结果 |

### 4.2 标准语义错误码 (`code`)
后端接口采用标准错误码设计，前端拦截器无需硬编码 URL：
- `TOKEN_EXPIRED`：Token 失效或未授权，前端自动触发重新登录；
- `INVALID_PASSWORD`：密码错误，附带 `remaining` 剩余尝试次数；
- `IP_BANNED`：连续错误达到上限，IP 已被自动封禁。

---

## 5. 本地运行与生产部署 (Systemd)

### 5.1 运行命令

```bash
# 启动生产服务
npm start

# 启动开发监听服务
npm run dev
```

### 5.2 Systemd 配置文件 (`/etc/systemd/system/api-dashboard.service`)

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

```bash
# 重载服务并重启
systemctl daemon-reload
systemctl restart api-dashboard.service
```
