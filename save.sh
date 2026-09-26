#!/usr/bin/env bash
set -e

# Цвета для красивого вывода в терминале
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}🛡️  Безопасное сохранение и синхронизация с GitHub${NC}"
echo -e "${BLUE}==============================================${NC}"

# 1. Проверка синтаксиса Python (защита от глюков)
echo -e "\n${YELLOW}🔍 Шаг 1: Проверка кода на синтаксические ошибки...${NC}"
PYTHON_BIN="./venv/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

if ! $PYTHON_BIN -m compileall -q app/ ; then
    echo -e "${RED}❌ ОШИБКА: В коде обнаружены синтаксические ошибки!${NC}"
    echo -e "${RED}Пуш отменён, чтобы не отправить сломанный код на GitHub.${NC}"
    echo -e "${YELLOW}Исправьте ошибку в коде и попробуйте снова.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Код успешно прошёл проверку синтаксиса!${NC}"

# 2. Создание резервной копии базы данных и конфигурации
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups/backup_${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

echo -e "\n${YELLOW}💾 Шаг 2: Создание локальной резервной копии...${NC}"
if [ -f "secretary.db" ]; then
    cp secretary.db "$BACKUP_DIR/secretary.db"
    echo -e "${GREEN}✓ База данных сохранена в $BACKUP_DIR/secretary.db${NC}"
fi
if [ -f ".env" ]; then
    cp .env "$BACKUP_DIR/.env"
    echo -e "${GREEN}✓ Настройки (.env) сохранены в $BACKUP_DIR/.env${NC}"
fi

# Ограничиваем количество резервных копий (оставляем последние 10)
ls -dt backups/backup_* 2>/dev/null | tail -n +11 | xargs rm -rf 2>/dev/null || true

# 3. Запрос описания изменений (если не передано аргументом)
COMMIT_MSG="$*"
if [ -z "$COMMIT_MSG" ]; then
    echo -e "\n${BLUE}📝 Введите краткое описание того, что изменилось:${NC}"
    read -r -p "> " COMMIT_MSG
fi

if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="update: автоматическое сохранение $TIMESTAMP"
fi

# 4. Проверка наличия изменений в Git
if [ -z "$(git status --porcelain)" ]; then
    echo -e "\n${YELLOW}ℹ️  Нет новых изменений в коде для отправки.${NC}"
    echo -e "${GREEN}✓ Резервная копия сохранена в $BACKUP_DIR${NC}"
    exit 0
fi

# 5. Создание контрольной точки (Git Tag)
TAG_NAME="checkpoint_${TIMESTAMP}"
git add .
git commit -m "$COMMIT_MSG"
git tag "$TAG_NAME"

echo -e "\n${YELLOW}🚀 Шаг 3: Отправка обновлений на GitHub...${NC}"
git push origin main
git push origin "$TAG_NAME"

echo -e "\n${GREEN}==============================================${NC}"
echo -e "${GREEN}✅ Всё успешно сохранено и отправлено на GitHub!${NC}"
echo -e "${GREEN}📌 Контрольная точка: ${TAG_NAME}${NC}"
echo -e "${GREEN}📦 Резервная копия базы: ${BACKUP_DIR}${NC}"
echo -e "${BLUE}💡 Если что-то пойдёт не так, вы всегда можете вернуть всё назад командой:${NC}"
echo -e "${YELLOW}   ./rollback.sh${NC}"
echo -e "${GREEN}==============================================${NC}"
