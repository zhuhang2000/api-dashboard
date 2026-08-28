# Codex API Dashboard 日常维护指南

本项目主要包含两个核心服务：**Codex API Dashboard 服务**（前端看板服务）和 **Nginx 服务**（前端反向代理与 SSL 卸载）。本指南整理了服务的日常管理、状态查看、重启以及相关配置文件的路径。

---

## 1. 服务清单与状态管理

| 服务名称 | 描述 | 监听端口 | 启动方式 |
| :--- | :--- | :--- | :--- |
| **api-dashboard.service** | Codex API Dashboard 主服务 | `3456` (仅 localhost) | Systemd 服务 |
| **nginx.service** | 反向代理及 HTTPS 服务 | `80` / `443` (公网) | Systemd 服务 |

### 1.1 查看服务状态

* **查看 Codex API Dashboard 状态**：
  ```bash
  systemctl status api-dashboard.service
  ```
* **查看 Nginx 状态**：
  ```bash
  systemctl status nginx
  ```
* **查看端口监听状态**：
  ```bash
  ss -tlnp | grep -E "3456|80|443"
  ```

### 1.2 查看服务日志

* **实时查看 Codex API Dashboard 日志**（日志由 Systemd 统一收集）：
  ```bash
  # 实时滚动查看最后 100 行日志
  journalctl -u api-dashboard.service -f -n 100
  ```
* **查看 Nginx 访问与错误日志**：
  ```bash
  # 访问日志
  tail -f /var/log/nginx/access.log
  # 错误日志
  tail -f /var/log/nginx/error.log
  ```

---

## 2. 服务启停与重启

在修改配置文件或遇到服务异常时，可以使用以下命令进行服务控制：

### 2.1 重启服务（最常用）

* **重启 Codex API Dashboard**：
  ```bash
  systemctl restart api-dashboard.service
  ```
* **重启 Nginx**（重启前建议先测试配置文件语法）：
  ```bash
  # 1. 检查 Nginx 配置语法是否正确
  nginx -t
  
  # 2. 语法无误后重启
  systemctl restart nginx
  ```

### 2.2 启动与停止服务

* **启动服务**：
  ```bash
  systemctl start api-dashboard.service
  systemctl start nginx
  ```
* **停止服务**：
  ```bash
  systemctl stop api-dashboard.service
  systemctl stop nginx
  ```

### 2.3 Systemd 重载配置

如果你修改了 Systemd 服务配置文件本身（即 `/etc/systemd/system/api-dashboard.service`），需要先重载 Systemd 配置，然后再重启服务：
```bash
systemctl daemon-reload
systemctl restart api-dashboard.service
```

---

## 3. 配置文件及重要路径

| 配置文件类型 | 绝对路径 | 作用说明 |
| :--- | :--- | :--- |
| **环境变量配置文件** | `/opt/services/api-dashboard/.env` | 监听端口、监听 Host、CPA API 地址、管理密钥与管理员密码 |
| **Systemd 服务文件** | `/etc/systemd/system/api-dashboard.service` | 控制工作目录、启动命令及守护进程配置 |
| **Nginx 虚拟主机配置** | `/etc/nginx/sites-available/api-dashboard.conf` | 域名 `dashboard.alpha-lab.cc` 的 SSL 及反向代理规则配置 |
| **SSL 证书 (Cloudflare)** | `/etc/ssl/cloudflare/origin.pem` | Nginx HTTPS 所需的 origin 证书文件 |
| **SSL 密匙 (Cloudflare)** | `/etc/ssl/cloudflare/origin.key` | Nginx HTTPS 所需的证书私钥文件 |

---

## 4. 简易可用性测试

如果你想在服务器本地直接测试 Dashboard 服务是否存活，可以执行以下 `curl` 命令：

```bash
# 测试本地 Dashboard 服务是否可正常响应
curl -i http://127.0.0.1:3456

# 测试 Nginx 代理域名是否正常重定向至 HTTPS
curl -H "Host: dashboard.alpha-lab.cc" -i http://127.0.0.1
```
