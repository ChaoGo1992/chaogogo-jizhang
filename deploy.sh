#!/usr/bin/env bash
# 超超记账后端一键部署（Ubuntu 22.04/24.04，CentOS 见手册差异说明）
# 用法：把整个 server/ 目录上传到服务器（如 /opt/jizhang/server），然后在目录内执行：
#   bash deploy.sh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="jizhang-api"
DOMAIN="${1:-}"   # 可选：传入域名则自动配置 Nginx + HTTPS，如 bash deploy.sh api.chaogogo.cn

echo "==> 1/5 安装系统依赖"
if command -v apt >/dev/null 2>&1; then
  sudo apt update -y
  sudo apt install -y curl nginx
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y curl nginx
fi

echo "==> 2/5 安装 Node.js 20"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null || \
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  if command -v apt >/dev/null 2>&1; then sudo apt install -y nodejs; else sudo yum install -y nodejs; fi
fi
node -v

echo "==> 3/5 安装 PM2 与项目依赖"
sudo npm i -g pm2 --registry=https://registry.npmmirror.com
cd "$APP_DIR"
[ -f .env ] || { cp .env.example .env; echo "!!! 请先编辑 .env 填入 WX_SECRET 和 JWT_SECRET，再重新执行本脚本 !!!"; exit 1; }
npm i --registry=https://registry.npmmirror.com

echo "==> 4/5 启动服务 (PM2)"
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start src/index.js --name "$APP_NAME"
pm2 save
pm2 startup | tail -1 | sudo bash || true

echo "==> 5/5 配置 Nginx 反向代理"
if [ -n "$DOMAIN" ]; then
  sudo tee /etc/nginx/conf.d/jizhang.conf >/dev/null <<EOF
server {
  listen 80;
  server_name $DOMAIN;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF
  sudo nginx -t && sudo systemctl reload nginx
  echo "==> 配置 HTTPS (certbot)"
  if command -v apt >/dev/null 2>&1; then sudo apt install -y certbot python3-certbot-nginx; else sudo yum install -y certbot python3-certbot-nginx; fi
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@$DOMAIN || echo "!!! HTTPS 配置失败，请确认域名已解析到本机后再手动执行: sudo certbot --nginx -d $DOMAIN"
else
  echo "（未传域名参数，跳过 Nginx/HTTPS。可用: bash deploy.sh api.chaogogo.cn 重新执行）"
fi

echo ""
echo "=============================================="
echo " 部署完成！本机验证: curl http://127.0.0.1:3000/api/ping"
[ -n "$DOMAIN" ] && echo " 线上验证: curl https://$DOMAIN/api/ping"
echo " 常用命令: pm2 logs $APP_NAME | pm2 restart $APP_NAME"
echo "=============================================="
