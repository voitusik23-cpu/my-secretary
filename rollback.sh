#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${RED}==============================================${NC}"
echo -e "${RED}⏪ Мастер отката изменений (Rollback)${NC}"
echo -e "${RED}==============================================${NC}"

# Показываем последние 5 коммитов
echo -e "\n${YELLOW}Последние 5 состояний проекта:${NC}"
git log -5 --pretty=format:"%C(yellow)%h%Creset - %C(cyan)%ad%Creset : %s" --date=short
echo -e "\n"

# Создаем экстренную резервную копию текущего состояния перед откатом
EMERGENCY_TIME=$(date +"%Y%m%d_%H%M%S")
EMERGENCY_DIR="backups/before_rollback_${EMERGENCY_TIME}"
mkdir -p "$EMERGENCY_DIR"
if [ -f "secretary.db" ]; then
    cp secretary.db "$EMERGENCY_DIR/secretary.db"
fi
if [ -f ".env" ]; then
    cp .env "$EMERGENCY_DIR/.env"
fi
echo -e "${BLUE}🛡️  Текущее состояние базы и настроек перед откатом сохранено в:${NC}"
echo -e "   $EMERGENCY_DIR"

# Спрашиваем подтверждение на откат на 1 шаг назад (к предыдущему коммиту)
echo -e "\n${YELLOW}Вы хотите откатить код на 1 шаг назад (к предыдущему стабильному коммиту)? [y/N]${NC}"
read -r -p "> " CONFIRM

if [[ "$CONFIRM" =~ ^[YyДд]$ ]]; then
    # Откатываем код в Git
    git reset --hard HEAD~1
    
    # Спрашиваем про базу данных
    LATEST_BACKUP=$(ls -td backups/backup_* 2>/dev/null | head -n 1 || true)
    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP/secretary.db" ]; then
        echo -e "\n${YELLOW}Восстановить также базу данных из резервной копии ($LATEST_BACKUP)? [y/N]${NC}"
        read -r -p "> " RESTORE_DB
        if [[ "$RESTORE_DB" =~ ^[YyДд]$ ]]; then
            cp "$LATEST_BACKUP/secretary.db" ./secretary.db
            echo -e "${GREEN}✓ База данных восстановлена из $LATEST_BACKUP${NC}"
        fi
    fi

    # Обновляем репозиторий на GitHub
    echo -e "\n${YELLOW}Отправить откат на GitHub? [y/N]${NC}"
    read -r -p "> " PUSH_CONFIRM
    if [[ "$PUSH_CONFIRM" =~ ^[YyДд]$ ]]; then
        git push origin main --force-with-lease
        echo -e "${GREEN}✓ GitHub успешно синхронизирован с откатом!${NC}"
    else
        echo -e "${YELLOW}ℹ️  Откат применён только локально на вашем компьютере.${NC}"
    fi

    echo -e "\n${GREEN}==============================================${NC}"
    echo -e "${GREEN}✅ Проект успешно возвращён к предыдущему состоянию!${NC}"
    echo -e "${GREEN}==============================================${NC}"
else
    echo -e "\n${BLUE}Откат отменён. Никаких изменений не внесено.${NC}"
fi
