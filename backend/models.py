import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import (
    create_engine,
    String,
    Integer,
    Boolean,
    ForeignKey,
    Text,
    event,
    inspect,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATA = Path(os.getenv("DATA_DIR", "data")).resolve()
DATA.mkdir(parents=True, exist_ok=True)
engine = create_engine(os.getenv("DATABASE_URL", f'sqlite:///{DATA / "app.db"}'))
if engine.dialect.name == "sqlite":

    @event.listens_for(engine, "connect")
    def sqlite_constraints(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")


Session = sessionmaker(engine)


class Base(DeclarativeBase):
    pass


class AdminUser(Base):
    __tablename__ = "admin_users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    session_token_hash: Mapped[str] = mapped_column(String(64), default="")


class BookCategory(Base):
    __tablename__ = "book_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(default=0)


class AudioCategory(Base):
    __tablename__ = "audio_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(default=0)


class Content:
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    author: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    file: Mapped[str] = mapped_column(String(100), default="")
    cover: Mapped[str] = mapped_column(String(100), default="")
    position: Mapped[int] = mapped_column(default=0)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    downloadable: Mapped[bool] = mapped_column(Boolean, default=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(
        String(40), default=lambda: datetime.now(timezone.utc).isoformat()
    )


class Book(Content, Base):
    __tablename__ = "books"
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("book_categories.id"), nullable=True
    )
    direction: Mapped[str] = mapped_column(String(3), default="rtl")


class Audio(Content, Base):
    __tablename__ = "audio"
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("audio_categories.id"), nullable=True
    )


class Playlist(Base):
    __tablename__ = "playlists"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class PlaylistItem(Base):
    __tablename__ = "playlist_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    playlist_id: Mapped[int] = mapped_column(ForeignKey("playlists.id"))
    audio_id: Mapped[int] = mapped_column(ForeignKey("audio.id"))
    position: Mapped[int] = mapped_column(default=0)


class AppSettings(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    value: Mapped[str] = mapped_column(Text, default="{}")


Base.metadata.create_all(engine)
# Upgrade existing MVP databases without discarding content or administrator accounts.
if "session_token_hash" not in {
    column["name"] for column in inspect(engine).get_columns("admin_users")
}:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "ALTER TABLE admin_users ADD COLUMN session_token_hash VARCHAR(64) NOT NULL DEFAULT ''"
        )
