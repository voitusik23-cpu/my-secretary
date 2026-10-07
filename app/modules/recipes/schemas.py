from typing import List, Optional
from datetime import datetime as dt_datetime
from pydantic import BaseModel, Field, ConfigDict


class IngredientItem(BaseModel):
    name: str = Field(..., description="Назва продукту (напр. Борошно, Вершки)")
    amount: Optional[str] = Field(None, description="Кількість (напр. 200, 2, 0.5)")
    unit: Optional[str] = Field(None, description="Одиниця виміру (напр. г, мл, шт, ст.л.)")


class RecipeBase(BaseModel):
    title: str = Field(..., description="Назва страви")
    category: str = Field("Вечеря", description="Сніданок, Обід, Вечеря, Десерт, Випічка, тощо")
    description: Optional[str] = Field(None, description="Короткий опис страви")
    ingredients: List[IngredientItem] = Field(default_factory=list, description="Список інгредієнтів")
    instructions: Optional[str] = Field(None, description="Покроковий рецепт приготування")
    prep_time_minutes: int = Field(30, ge=1, le=600, description="Час приготування в хвилинах")
    servings: int = Field(2, ge=1, le=50, description="Кількість порцій")


class RecipeCreate(RecipeBase):
    user_id: Optional[str] = "default"


class RecipeUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    ingredients: Optional[List[IngredientItem]] = None
    instructions: Optional[str] = None
    prep_time_minutes: Optional[int] = None
    servings: Optional[int] = None


class RecipeResponse(RecipeBase):
    id: int
    user_id: str
    created_at: dt_datetime

    model_config = ConfigDict(from_attributes=True)


class AddToShoppingRequest(BaseModel):
    selected_ingredients: Optional[List[str]] = Field(
        None,
        description="Якщо передано, до списку покупок підуть лише ці назви. Якщо None, додаються всі інгредієнти."
    )


class AddToShoppingResponse(BaseModel):
    added_count: int
    recipe_id: int
    items_added: List[str]
