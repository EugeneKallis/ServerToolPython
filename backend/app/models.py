from typing import List, Optional
from sqlalchemy import String, ForeignKey, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=naming_convention)

class MacroGroup(Base):
    __tablename__ = "macro_group"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    ord: Mapped[int] = mapped_column(default=0)
    
    # Link from MacroGroup to Macros
    macros: Mapped[List["Macro"]] = relationship(back_populates="macro_group", cascade="all, delete-orphan")

class Macro(Base):
    __tablename__ = "macro"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    ord: Mapped[int] = mapped_column(default=0)
    macro_group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("macro_group.id"))
    
    # Relationship back to MacroGroup
    macro_group: Mapped[Optional["MacroGroup"]] = relationship(back_populates="macros")
    
    # Link from Macro to Commands
    commands: Mapped[List["Command"]] = relationship(back_populates="macro", cascade="all, delete-orphan")

class Command(Base):
    __tablename__ = "command"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    ord: Mapped[int] = mapped_column(default=0)
    command: Mapped[str] = mapped_column(String)
    macro_id: Mapped[Optional[int]] = mapped_column(ForeignKey("macro.id"))
    
    # Link from Command back to Macro
    macro: Mapped[Optional["Macro"]] = relationship(back_populates="commands")
