#!/usr/bin/env bash
# ==============================================================================
# Мой Секретарь — Сборка архива для переноса на сервер (One-Click Package)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}📦 Сборка полного пакета проекта для переноса на сервер${NC}"
echo -e "${BLUE}======================================================${NC}"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

ARCHIVE_NAME="secretary_server_bundle.tar.gz"

# 1. Проверяем наличие ключевых файлов
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️ Файл .env не найден! Убедитесь, что настройки существуют.${NC}"
fi

if [ ! -f "secretary.db" ]; then
    echo -e "${YELLOW}⚠️ Файл secretary.db не найден! База данных будет пустой.${NC}"
fi

chmod +x setup_server.sh save.sh rollback.sh 2>/dev/null || true

# 2. Упаковываем файлы проекта в архив
echo -e "🗜️ Создаю архив ${ARCHIVE_NAME}..."
tar --exclude=".git" \
    --exclude="venv" \
    --exclude="__pycache__" \
    --exclude="*.pyc" \
    --exclude=".DS_Store" \
    --exclude="*.tar.gz" \
    -czf "${ARCHIVE_NAME}" \
    app/ \
    frontend/ \
    docs/ \
    requirements.txt \
    Dockerfile \
    docker-compose.yml \
    setup_server.sh \
    save.sh \
    rollback.sh \
    .env \
    secretary.db

ARCHIVE_SIZE=$(du -h "${ARCHIVE_NAME}" | cut -f1)

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ Архив готов: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})${NC}"
echo -e "${GREEN}======================================================${NC}"

echo -e "\n${BLUE}🚀 КАК ПЕРЕНЕСТИ И ЗАПУСТИТЬ В ОДИН КЛИК:${NC}"
echo -e "\n1. Скопируйте архив на ваш сервер (замените IP и пользователя):"
echo -e "   ${YELLOW}scp ${ARCHIVE_NAME} root@IP_ВАШЕГО_СЕРВЕРА:~/${NC}"
echo -e "\n2. Зайдите на сервер по SSH:"
echo -e "   ${YELLOW}ssh root@IP_ВАШЕГО_СЕРВЕРА${NC}"
echo -e "\n3. Распакуйте и запустите одной командой:"
echo -e "   ${YELLOW}mkdir -p ~/my-secretary && tar -xzf ~/${ARCHIVE_NAME} -C ~/my-secretary && cd ~/my-secretary && ./setup_server.sh${NC}"
echo -e "\n${GREEN}Всё! Скрипт проверит порт, настроит автозапуск и выдаст ссылку для браузера и iPhone.${NC}\n"
