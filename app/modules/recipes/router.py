import json
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_secret_key
from app.modules.recipes.models import Recipe
from app.modules.recipes.schemas import (
    RecipeCreate,
    RecipeUpdate,
    RecipeResponse,
    IngredientItem,
    AddToShoppingRequest,
    AddToShoppingResponse,
)

recipes_router = APIRouter(
    prefix="/api/v1/recipes",
    tags=["Recipes & Kitchen (Рецепти та кухня)"],
    dependencies=[Depends(verify_secret_key)],
)


def _to_response(r: Recipe) -> RecipeResponse:
    try:
        raw = json.loads(r.ingredients_json or "[]")
        ingredients = [IngredientItem(**item) for item in raw]
    except Exception:
        ingredients = []

    return RecipeResponse(
        id=r.id,
        title=r.title,
        category=r.category,
        description=r.description,
        ingredients=ingredients,
        instructions=r.instructions,
        prep_time_minutes=r.prep_time_minutes,
        servings=r.servings,
        user_id=r.user_id,
        created_at=r.created_at,
    )


@recipes_router.get("", response_model=List[RecipeResponse])
def get_recipes(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Список усіх збережених рецептів сім'ї."""
    query = db.query(Recipe)
    if user_id:
        query = query.filter((Recipe.user_id == user_id) | (Recipe.user_id == "default"))
    if category:
        query = query.filter(Recipe.category == category)

    recipes = query.order_by(Recipe.created_at.desc()).all()
    results = [_to_response(r) for r in recipes]

    if search:
        s_lower = search.lower()
        results = [r for r in results if s_lower in r.title.lower() or (r.description and s_lower in r.description.lower())]

    return results


@recipes_router.post("", response_model=RecipeResponse, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeCreate, db: Session = Depends(get_db)):
    """Додати новий рецепт до кулінарної книги."""
    ing_dicts = [ing.model_dump() for ing in payload.ingredients]
    recipe = Recipe(
        title=payload.title.strip(),
        category=payload.category,
        description=payload.description,
        ingredients_json=json.dumps(ing_dicts, ensure_ascii=False),
        instructions=payload.instructions,
        prep_time_minutes=payload.prep_time_minutes,
        servings=payload.servings,
        user_id=payload.user_id or "default",
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return _to_response(recipe)


@recipes_router.get("/{recipe_id}", response_model=RecipeResponse)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    """Отримати деталі конкретного рецепту."""
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не знайдено")
    return _to_response(recipe)


@recipes_router.post("/{recipe_id}/add-to-shopping", response_model=AddToShoppingResponse)
def add_recipe_ingredients_to_shopping(
    recipe_id: int,
    payload: AddToShoppingRequest,
    db: Session = Depends(get_db),
):
    """
    Автоматично експортує інгредієнти рецепта до списку покупок сім'ї.
    """
    from app.models.shopping import ShoppingItem

    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не знайдено")

    try:
        raw = json.loads(recipe.ingredients_json or "[]")
    except Exception:
        raw = []

    added_names = []
    filter_set = set(payload.selected_ingredients) if payload.selected_ingredients else None

    for item in raw:
        name = item.get("name", "").strip()
        if not name:
            continue
        if filter_set and name not in filter_set:
            continue

        amount = item.get("amount") or ""
        unit = item.get("unit") or ""
        qty_str = f"{amount} {unit}".strip() or "1 шт"

        shopping_entry = ShoppingItem(
            item=name,
            category="Продукти",
            quantity=qty_str,
            is_purchased=False,
            notes=f"Для рецепта: {recipe.title}",
            created_at=datetime.utcnow(),
        )
        db.add(shopping_entry)
        added_names.append(name)

    db.commit()

    return AddToShoppingResponse(
        added_count=len(added_names),
        recipe_id=recipe.id,
        items_added=added_names,
    )


@recipes_router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    """Видалити рецепт."""
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не знайдено")
    db.delete(recipe)
    db.commit()
    return None
