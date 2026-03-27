from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Boolean, ForeignKey, Integer, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ScrapedItem(Base):
    __tablename__ = "scraped_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String)
    image_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    magnet_link: Mapped[str] = mapped_column(String, unique=True, index=True)
    torrent_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source: Mapped[str] = mapped_column(String, index=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    is_downloaded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

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
