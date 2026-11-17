from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import (
    PaymentCategory,
    PaymentCategoryGroup,
    User,
    Workspace,
    WorkspaceMember,
)


async def create_workspace(
    db: AsyncSession,
    owner: User,
    name: str,
    default_currency: str = "UAH",
) -> Workspace:
    workspace = Workspace(
        name=name.strip(),
        owner_id=owner.id,
        default_currency=default_currency.upper(),
    )
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(
        workspace_id=workspace.id,
        user_id=owner.id,
        role="admin",
    ))
    await _copy_legacy_categories(db, workspace.id)
    return workspace


async def _copy_legacy_categories(db: AsyncSession, workspace_id: int) -> None:
    legacy = await db.execute(
        select(Workspace.id).where(Workspace.name == "Legacy workspace").order_by(Workspace.id).limit(1)
    )
    legacy_workspace_id = legacy.scalar_one_or_none()
    if legacy_workspace_id is None or legacy_workspace_id == workspace_id:
        return

    session_info = db.sync_session.info
    previous_workspace_id = session_info.get("workspace_id")
    session_info["workspace_id"] = legacy_workspace_id
    try:
        group_result = await db.execute(
            select(PaymentCategoryGroup).order_by(PaymentCategoryGroup.id)
        )
        old_groups = group_result.scalars().all()
        category_result = await db.execute(
            select(PaymentCategory).order_by(PaymentCategory.id)
        )
        old_categories = category_result.scalars().all()
        group_data = [
            {
                "id": group.id,
                "name": group.name,
                "code": group.code,
                "color": group.color,
                "emoji": group.emoji,
                "is_active": group.is_active,
            }
            for group in old_groups
        ]
        category_data = [
            {
                "name": category.name,
                "group_id": category.group_id,
                "description": category.description,
            }
            for category in old_categories
        ]
    finally:
        if previous_workspace_id is None:
            session_info.pop("workspace_id", None)
        else:
            session_info["workspace_id"] = previous_workspace_id

    session_info["workspace_id"] = workspace_id
    group_id_map = {}
    for data in group_data:
        old_id = data.pop("id")
        group = PaymentCategoryGroup(workspace_id=workspace_id, **data)
        db.add(group)
        await db.flush()
        group_id_map[old_id] = group.id

    for data in category_data:
        old_group_id = data.pop("group_id")
        db.add(PaymentCategory(
            workspace_id=workspace_id,
            group_id=group_id_map.get(old_group_id),
            **data,
        ))
    await db.flush()
