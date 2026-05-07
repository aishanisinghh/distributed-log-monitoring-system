#!/bin/bash
set -e

# This script is intended to be run on the AWS EC2 instance.
# It installs Docker and Docker Compose only if not already present,
# then pulls the latest code and starts the stack.

echo "==> Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing..."
    sudo apt-get update -y
    sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common

    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    echo "Docker installed successfully."
else
    echo "Docker already installed: $(docker --version)"
fi

echo "==> Checking Docker Compose installation..."
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose not found. Installing..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose installed successfully."
else
    echo "Docker Compose already installed: $(docker-compose --version)"
fi

echo "==> Deploying stack..."
cd /home/ubuntu/distributed-log-monitoring-system || exit 1

sudo docker-compose down --remove-orphans || true
sudo docker-compose up -d --build

echo "==> Deployment complete!"
