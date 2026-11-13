from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

COLUMN_IDS = ["ideas", "todo", "progress", "review", "done"]
# Whole-string form also works with provider decoders that anchor JSON Schema patterns.
NonBlank = Annotated[str, StringConstraints(pattern=r"^[\s\S]*\S[\s\S]*$")]


class BoardModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Card(BoardModel):
    id: NonBlank
    title: NonBlank
    details: str


class Column(BoardModel):
    id: str
    name: NonBlank
    cards: list[Card]


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
