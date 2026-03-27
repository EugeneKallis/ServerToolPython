from typing import List, Optional
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, MetaData, Text, DateTime, Float, Integer
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

    # Link from Macro to Schedules
    schedules: Mapped[List["MacroSchedule"]] = relationship(back_populates="macro", cascade="all, delete-orphan")
    
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
    
    # Link from Command to Optional Arguments
    arguments: Mapped[List["CommandArgument"]] = relationship(back_populates="command", cascade="all, delete-orphan")

class CommandArgument(Base):
    __tablename__ = "command_argument"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    arg_name: Mapped[str] = mapped_column(String)  # The display name
    arg_value: Mapped[str] = mapped_column(String) # The actual value to append (e.g., "--force")
    command_id: Mapped[int] = mapped_column(ForeignKey("command.id"))
    
    # Link back to Command
    command: Mapped["Command"] = relationship(back_populates="arguments")

class ArrInstance(Base):
    __tablename__ = "arr_instance"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    type: Mapped[str] = mapped_column(String)  # "radarr" or "sonarr"
    url: Mapped[str] = mapped_column(String)
    api_key: Mapped[str] = mapped_column(String)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ScriptRun(Base):
    __tablename__ = "script_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(String, unique=True, index=True) # UUID for deduplication
    macro_name: Mapped[str] = mapped_column(String, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    success: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class MacroSchedule(Base):
    __tablename__ = "macro_schedule"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    macro_id: Mapped[int] = mapped_column(ForeignKey("macro.id"))
    cron_expression: Mapped[str] = mapped_column(String) # e.g. "*/5 * * * *"
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    args: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # JSON string of selected arguments

    # Link back to Macro
    macro: Mapped["Macro"] = relationship(back_populates="schedules")


class ScrapedItem(Base):
    __tablename__ = "scraped_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String)
    image_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    magnet_link: Mapped[str] = mapped_column(String, unique=True, index=True)
    torrent_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # comma-separated
    source: Mapped[str] = mapped_column(String, index=True)  # "141jav" | "projectjav" | "pornrips"
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    is_downloaded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    files: Mapped[List["ScrapedItemFile"]] = relationship(back_populates="item", cascade="all, delete-orphan")


class ScrapedItemFile(Base):
    __tablename__ = "scraped_item_file"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("scraped_item.id"))
    magnet_link: Mapped[str] = mapped_column(String, unique=True, index=True)
    file_size: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    seeds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    leechers: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    item: Mapped["ScrapedItem"] = relationship(back_populates="files")


class ChatConversation(Base):
    __tablename__ = "chat_conversation"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String, default="New Chat")
    model: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.id",
    )


class ChatMessage(Base):
    __tablename__ = "chat_message"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("chat_conversation.id"))
    role: Mapped[str] = mapped_column(String)   # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    conversation: Mapped["ChatConversation"] = relationship(back_populates="messages")
