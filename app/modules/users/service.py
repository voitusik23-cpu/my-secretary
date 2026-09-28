import json
from typing import List, Optional
from sqlalchemy.orm import Session
from app.modules.users.models import User, UserSettings
from app.modules.users.schemas import ModuleCatalogItem

# Повний каталог модулів системи "Секретар AI"
MODULE_CATALOG: List[ModuleCatalogItem] = [
    ModuleCatalogItem(
        id="shopping",
        title="Список покупок",
        description="Синхронізація покупок у реальному часі, розбивка за категоріями",
        category="Дім і побут",
        icon="🛒",
        default_for_roles=["admin", "family", "child"]
    ),
    ModuleCatalogItem(
        id="tasks",
        title="Завдання та нагадування",
        description="Особисті справи, дедлайни, розумний розбір голосових доручень",
        category="Продуктивність",
        icon="✅",
        default_for_roles=["admin", "family", "child", "guest"]
    ),
    ModuleCatalogItem(
        id="plants",
        title="Полив квітів та рослини",
        description="Каталог домашніх квітів, графік поливу й підживлення, фото рослин",
        category="Дім і побут",
        icon="🌿",
        default_for_roles=["admin", "family"]
    ),
    ModuleCatalogItem(
        id="recipes",
        title="Рецепти та кулінарія",
        description="Книга улюблених страв, меню на тиждень, автододавання інгредієнтів у покупки",
        category="Дім і побут",
        icon="🍳",
        default_for_roles=["admin", "family"]
    ),
    ModuleCatalogItem(
        id="finance",
        title="Фінанси та бюджет",
        description="Облік витрат і доходів, категорії, мультивалюта UAH/USD",
        category="Фінанси",
        icon="💰",
        default_for_roles=["admin"]
    ),
    ModuleCatalogItem(
        id="inventory",
        title="Де що лежить (Інвентар)",
        description="Швидкий пошук речей у домі, сезонний одяг, інструменти, документи",
        category="Дім і побут",
        icon="📦",
        default_for_roles=["admin", "family"]
    ),
    ModuleCatalogItem(
        id="auto",
        title="Автомобіль та ТО",
        description="Пробіг, витрати на авто, історія замін масла, нагадування про страховку",
        category="Авто і транспорт",
        icon="🚗",
        default_for_roles=["admin"]
    ),
    ModuleCatalogItem(
        id="utilities",
        title="ЖКГ та лічильники",
        description="Показники води, світла, газу, контроль тарифів та квитанцій",
        category="Дім і побут",
        icon="💡",
        default_for_roles=["admin"]
    ),
    ModuleCatalogItem(
        id="fitness",
        title="Фітнес та тренування",
        description="Кроки, лижні спуски, вага, дистанція бігу",
        category="Здоров'я",
        icon="🏃",
        default_for_roles=["admin", "family"]
    ),
    ModuleCatalogItem(
        id="health_vitals",
        title="Тиск та пульс",
        description="Журнал вимірювання артеріального тиску і пульсу",
        category="Здоров'я",
        icon="❤️",
        default_for_roles=["admin", "family"]
    ),
    ModuleCatalogItem(
        id="delegation",
        title="Сімейні доручення",
        description="Передача завдань між членами сім'ї",
        category="Сім'я",
        icon="🤝",
        default_for_roles=["admin", "family"]
    ),
    ModuleCatalogItem(
        id="movies",
        title="Фільми та серіали",
        description="Список 'Що подивитися', оцінки, жанри",
        category="Дозвілля",
        icon="🎬",
        default_for_roles=["admin", "family", "child", "guest"]
    ),
    ModuleCatalogItem(
        id="translator",
        title="Перекладач ІІ",
        description="Миттєвий переклад текстів і вивчення мов",
        category="Інструменти",
        icon="🌐",
        default_for_roles=["admin", "family", "child"]
    ),
]


def get_default_modules_for_role(role: str) -> List[str]:
    """Повертає список модулів за замовчуванням для обраної ролі."""
    return [m.id for m in MODULE_CATALOG if role in m.default_for_roles]


def get_or_create_default_admin(db: Session) -> User:
    """Гарантує наявність головного користувача (Адміністратора) у системі."""
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            display_name="Вадим (Власник)",
            role="admin",
            is_active=True
        )
        db.add(admin)
        db.flush()

        all_modules = [m.id for m in MODULE_CATALOG]
        settings = UserSettings(
            user_id=admin.id,
            enabled_modules_json=json.dumps(all_modules),
            ai_persona="business",
            currency="UAH"
        )
        db.add(settings)
        db.commit()
        db.refresh(admin)
    return admin


def is_module_active_for_user(user: User, module_id: str) -> bool:
    """Перевіряє, чи увімкнено конкретний модуль для користувача."""
    if not user or not user.is_active:
        return False
    if user.role == "admin":
        return True
    if not user.settings:
        return False
    try:
        enabled = json.loads(user.settings.enabled_modules_json or "[]")
        return module_id in enabled
    except Exception:
        return False
