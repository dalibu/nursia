from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria
from config.settings import settings
import logging
from database.models import WorkspaceScoped

# Disable aiosqlite debug spam
logging.getLogger('aiosqlite').setLevel(logging.WARNING)

engine = create_async_engine(settings.DB_URL, echo=False)


@event.listens_for(Session, "do_orm_execute")
def apply_workspace_scope(execute_state):
    workspace_id = execute_state.session.info.get("workspace_id")
    if workspace_id is None or not (
        execute_state.is_select or execute_state.is_update or execute_state.is_delete
    ):
        return

    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            WorkspaceScoped,
            lambda model: model.workspace_id == workspace_id,
            include_aliases=True,
        )
    )


@event.listens_for(Session, "before_flush")
def enforce_workspace_scope(session, flush_context, instances):
    workspace_id = session.info.get("workspace_id")
    if workspace_id is None:
        return

    for instance in session.new:
        if isinstance(instance, WorkspaceScoped):
            if instance.workspace_id is None:
                instance.workspace_id = workspace_id
            elif instance.workspace_id != workspace_id:
                raise PermissionError("Cannot create records in another workspace")

    for instance in session.dirty.union(session.deleted):
        if isinstance(instance, WorkspaceScoped) and instance.workspace_id != workspace_id:
            raise PermissionError("Cannot modify records in another workspace")


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
