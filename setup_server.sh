#!/usr/bin/env bash
# ==============================================================================
# Мой Секретарь — Скрипт автоматической установки и запуска на сервере (One-Click)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}🚀 Установка «Мой Секретарь» на удалённый сервер${NC}"
echo -e "${BLUE}======================================================${NC}"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# 1. Проверка .env файла
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}⚠️ Файл .env не найден. Создаю из .env.example...${NC}"
        cp .env.example .env
        echo -e "${YELLOW}Пожалуйста, укажите ваши реальные ключи в .env после установки!${NC}"
    else
        echo -e "${RED}❌ Ошибка: Файл .env не найден!${NC}"
        exit 1
    fi
fi

# Читаем порт из .env (по умолчанию 8000)
PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 | tr -d ' "')
if [ -z "$PORT" ]; then
    PORT=8000
fi

# 2. Проверка, не занят ли порт другим проектом
echo -e "🔍 Проверяю порт ${PORT}..."
PORT_BUSY=false
if command -v lsof >/dev/null 2>&1; then
    if lsof -i :"$PORT" >/dev/null 2>&1; then
        PORT_BUSY=true
    fi
elif command -v ss >/dev/null 2>&1; then
    if ss -tuln | grep -q ":$PORT "; then
        PORT_BUSY=true
    fi
fi

if [ "$PORT_BUSY" = true ]; then
    echo -e "${YELLOW}⚠️ Внимание! Порт $PORT уже занят другим вашим проектом на сервере!${NC}"
    # Находим свободный порт (например, 8001 или 8080)
    NEW_PORT=$((PORT + 1))
    echo -e "${YELLOW}Автоматически переключаю «Мой Секретарь» на порт ${NEW_PORT}.${NC}"
    sed -i.bak "s/^PORT=.*/PORT=${NEW_PORT}/" .env
    PORT=$NEW_PORT
fi

# 3. Выбор способа запуска (Docker или Systemd Python)
USE_DOCKER=false
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Обнаружен Docker и Docker Compose.${NC}"
    echo -e "Хотите запустить через Docker? [Y/n]: "
    read -r -t 10 DOCKER_REPLY || DOCKER_REPLY="y"
    if [[ "$DOCKER_REPLY" =~ ^[Yy]$ ]] || [ -z "$DOCKER_REPLY" ]; then
        USE_DOCKER=true
    fi
fi

if [ "$USE_DOCKER" = true ]; then
    echo -e "${BLUE}📦 Запуск через Docker Compose...${NC}"
    # Создаем папку для бэкапов
    mkdir -p backups
    chmod 666 secretary.db 2>/dev/null || true
    
    docker compose down --remove-orphans 2>/dev/null || true
    docker compose up -d --build
    
    echo -e "⏳ Ожидаю запуска контейнера..."
    sleep 5
else
    echo -e "${BLUE}🐍 Запуск через системный сервис (systemd + Python venv)...${NC}"
    
    # Проверка наличия Python 3.10+
    if ! command -v python3 >/dev/null 2>&1; then
        echo -e "${YELLOW}Устанавливаю python3, python3-venv и pip...${NC}"
        sudo apt-get update -y && sudo apt-get install -y python3 python3-venv python3-pip curl
    fi

    # Создание venv если нет
    if [ ! -d "venv" ]; then
        echo -e "📦 Создаю виртуальное окружение venv..."
        python3 -m venv venv
    fi

    echo -e "📥 Установка зависимостей из requirements.txt..."
    ./venv/bin/pip install --upgrade pip >/dev/null 2>&1 || true
    ./venv/bin/pip install -r requirements.txt

    # Создание папки backups
    mkdir -p backups

    CURRENT_USER=$(whoami)
    SERVICE_FILE="/etc/systemd/system/secretary.service"

    echo -e "⚙️ Создаю службу автозапуска systemd (${SERVICE_FILE})..."
    sudo bash -c "cat > ${SERVICE_FILE}" <<EOF
[Unit]
Description=My Secretary AI Service
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${PROJECT_DIR}/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    echo -e "🔄 Перезапуск системной службы..."
    sudo systemctl daemon-reload
    sudo systemctl enable secretary
    sudo systemctl restart secretary
    sleep 3
fi

# 4. Проверка здоровья (Healthcheck)
echo -e "🩺 Проверяю работоспособность сервиса..."
HEALTH_CHECK=""
for i in {1..10}; do
    HEALTH_CHECK=$(curl -s "http://127.0.0.1:${PORT}/health" 2>/dev/null || true)
    if [[ "$HEALTH_CHECK" =~ "online" ]]; then
        break
    fi
    sleep 2
done

SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "ВАШ_IP_СЕРВЕРА")
SECRET_KEY=$(grep -E "^SECRET_KEY=" .env | cut -d '=' -f2 | tr -d ' "')

if [[ "$HEALTH_CHECK" =~ "online" ]]; then
    echo -e "\n${GREEN}======================================================${NC}"
    echo -e "${GREEN}🎉 ПОЗДРАВЛЯЕМ! «МОЙ СЕКРЕТАРЬ» УСПЕШНО ЗАПУЩЕН!${NC}"
    echo -e "${GREEN}======================================================${NC}"
    echo -e "🌐 Веб-интерфейс:   ${BLUE}http://${SERVER_IP}:${PORT}${NC}"
    echo -e "🔑 Секретный ключ:  ${YELLOW}${SECRET_KEY}${NC}"
    echo -e "\n💡 Для подключения с iPhone (Safari):"
    echo -e "   1. Откройте в Safari: http://${SERVER_IP}:${PORT}"
    echo -e "   2. Перейдите в Настройки ⚙️ и вставьте секретный ключ."
    echo -e "   3. Нажмите «Поделиться» -> «На экран Домой» (PWA)."
    echo -e "\n📋 Управление службой на сервере:"
    if [ "$USE_DOCKER" = true ]; then
        echo -e "   • Логи:    docker compose logs -f"
        echo -e "   • Рестарт: docker compose restart"
        echo -e "   • Стоп:    docker compose down"
    else
        echo -e "   • Логи:    sudo journalctl -u secretary -f"
        echo -e "   • Рестарт: sudo systemctl restart secretary"
        echo -e "   • Статус:  sudo systemctl status secretary"
    fi
    echo -e "${GREEN}======================================================${NC}\n"
else
    echo -e "${RED}⚠️ Сервис запущен, но проверка /health ещё не вернула ответ.${NC}"
    echo -e "Проверьте логи:"
    if [ "$USE_DOCKER" = true ]; then
        docker compose logs --tail=30
    else
        sudo journalctl -u secretary -n 30 --no-pager
    fi
fi
