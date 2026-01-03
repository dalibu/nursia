import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.core import get_db
from database.models import User, SystemSetting
from api.schemas.settings import (
    SystemSettingCreate, SystemSettingUpdate, 
    SystemSetting as SystemSettingSchema
)
from api.auth.oauth import get_admin_user, get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/debug", response_model=dict)
async def get_debug_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get debug settings for current user based on their role"""
    is_admin = current_user.is_admin
    
    # Get relevant settings
    settings_keys = [
        "debug_export_json_admin" if is_admin else "debug_export_json_worker"
    ]
    
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key.in_(settings_keys))
    )
    settings = {s.key: s.value for s in result.scalars().all()}
    
    # Build response
    return {
        "show_export_json": settings.get(
            "debug_export_json_admin" if is_admin else "debug_export_json_worker",
            "true" if is_admin else "false"
        ).lower() == "true"
    }


@router.get("/", response_model=List[SystemSettingSchema])
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(select(SystemSetting))
    return result.scalars().all()


@router.get("/{key}", response_model=SystemSettingSchema)
async def get_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.post("/", response_model=SystemSettingSchema)
async def create_setting(
    setting: SystemSettingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    db_setting = SystemSetting(**setting.model_dump())
    db.add(db_setting)
    await db.commit()
    await db.refresh(db_setting)
    return db_setting


@router.put("/{key}", response_model=SystemSettingSchema)
async def update_setting(
    key: str,
    setting_update: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    db_setting = result.scalar_one_or_none()
    if not db_setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    db_setting.value = setting_update.value
    if setting_update.description is not None:
        db_setting.description = setting_update.description
    
    await db.commit()
    await db.refresh(db_setting)
    return db_setting