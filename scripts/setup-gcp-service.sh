#!/usr/bin/env bash
set -e

# Setup script to configure systemd service for whatsapp-bridge on GCP VM
# Run this once on your GCP VM: bash scripts/setup-gcp-service.sh

USER_NAME=$(whoami)
REPO_DIR=$(pwd)

if [ ! -f "$REPO_DIR/whatsapp-bridge/main.go" ]; then
    echo "❌ Error: Please run this script from the root of the repository (~/whatsapp-mcp)"
    exit 1
fi

echo "📦 Setting up systemd service for user '$USER_NAME' at '$REPO_DIR'..."

sudo tee /etc/systemd/system/whatsapp-bridge.service > /dev/null <<EOF
[Unit]
Description=WhatsApp AI Go Bridge Daemon
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$REPO_DIR/whatsapp-bridge
ExecStart=$REPO_DIR/whatsapp-bridge/whatsapp-client --server --port 8080
Restart=always
RestartSec=5
Environment=PATH=/usr/local/go/bin:/usr/bin:/bin:$HOME/go/bin
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

echo "🔨 Building binary..."
cd "$REPO_DIR/whatsapp-bridge"
go build -o whatsapp-client .

echo "🔄 Reloading systemd and enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-bridge.service
sudo systemctl restart whatsapp-bridge.service

echo "✅ whatsapp-bridge.service is active and enabled on boot!"
sudo systemctl status whatsapp-bridge.service --no-pager
