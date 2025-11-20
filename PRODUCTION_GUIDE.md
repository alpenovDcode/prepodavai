# 🚀 Production Deployment Guide

This guide describes how to deploy the **PREPODAVAI** project to a production server.

## 📋 Prerequisites

Your server (VPS/Dedicated) must have the following installed:
1. **Docker** (v24+)
2. **Docker Compose** (v2+)
3. **Git**

### Installing Docker & Docker Compose (Ubuntu)
```bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

# Install Docker packages:
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 🛠️ Setup & Configuration

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd PREPODAVAI
   ```

2. **Configure Environment Variables**
   Copy the example production config:
   ```bash
   cp env.production.example .env
   ```
   
   **Edit `.env` and set ALL required values:**
   - `POSTGRES_PASSWORD` (min 16 chars)
   - `REDIS_PASSWORD` (min 16 chars)
   - `JWT_SECRET` (min 32 chars, use `openssl rand -hex 32`)
   - `TELEGRAM_BOT_TOKEN`
   - `NEXT_PUBLIC_API_URL` (your domain)
   - `CORS_ORIGIN` (your domain)

3. **Make deploy script executable**
   ```bash
   chmod +x deploy.sh
   ```

## 🚀 Deployment

To deploy or update the application, simply run:

```bash
./deploy.sh
```

This script will:
1. Pull the latest code from git.
2. Build optimized Docker images.
3. Start all services (Backend, Frontend, Worker, Bot, DB, Redis).
4. Run database migrations.

## 🔄 Updates

To update the application later, just commit your changes to the main branch and run `./deploy.sh` on the server again.

## 🛡️ Security Recommendations

1. **Firewall (UFW)**
   Allow only necessary ports:
   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```
   *Note: Do NOT open ports 3000, 3001, 5432, 6379 to the public internet. Use Nginx as a reverse proxy.*

2. **Nginx Reverse Proxy (Recommended)**
   Set up Nginx to proxy requests to:
   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:3001`

   Example Nginx config:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location /api {
           proxy_pass http://localhost:3001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **SSL/TLS**
   Use Certbot to get free SSL certificates:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
