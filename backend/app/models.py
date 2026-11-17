from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

COLUMN_IDS = ["ideas", "todo", "progress", "review", "done"]
# Whole-string form also works with provider decoders that anchor JSON Schema patterns.
NonBlank = Annotated[str, StringConstraints(pattern=r"^[\s\S]*\S[\s\S]*$")]


class BoardModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


MAX_CARDS_PER_COLUMN = 100


class Card(BoardModel):
    id: Annotated[NonBlank, Field(max_length=100)]
    title: Annotated[NonBlank, Field(max_length=5000)]
    details: Annotated[str, Field(max_length=50000)]
    labels: Annotated[list[str], Field(max_length=10)] = []
    due_date: Annotated[str | None, Field(max_length=10)] = None
    priority: Literal["none", "low", "medium", "high"] = "none"


class Column(BoardModel):
    id: str
    name: Annotated[NonBlank, Field(max_length=200)]
    cards: Annotated[list[Card], Field(max_length=MAX_CARDS_PER_COLUMN)]


class Board(BoardModel):
    columns: list[Column]

    @model_validator(mode="after")
    def validate_structure(self) -> "Board":
        if [column.id for column in self.columns] != COLUMN_IDS:
            raise ValueError("Keep the five fixed columns in their original order")
        card_ids = [card.id for column in self.columns for card in column.cards]
        if len(card_ids) != len(set(card_ids)):
            raise ValueError("Card IDs must be unique across the board")
        return self


class BoardDocument(BoardModel):
    revision: Annotated[int, Field(ge=1)]
    board: Board


class CreateBoard(BaseModel):
    name: NonBlank = Field(max_length=200)
    description: str = Field(default="", max_length=2000)


class UpdateBoard(BaseModel):
    name: NonBlank | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class BoardListItem(BaseModel):
    id: int
    name: str
    description: str
    card_count: int
    updated_at: float
