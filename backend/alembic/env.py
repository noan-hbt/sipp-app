import asyncio
from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (register tables)
from app.db import Base, engine

if context.config.config_file_name:
    fileConfig(context.config.config_file_name)

target_metadata = Base.metadata


def do_run(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_online():
    async with engine.connect() as conn:
        await conn.run_sync(do_run)
    await engine.dispose()


asyncio.run(run_online())
