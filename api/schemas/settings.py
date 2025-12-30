from typing import Optional
from pydantic import BaseModel, ConfigDict


class SystemSettingBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class SystemSettingCreate(SystemSettingBase):
    pass


class SystemSettingUpdate(BaseModel):
    value: str
    description: Optional[str] = None


class SystemSetting(SystemSettingBase):
    model_config = ConfigDict(from_attributes=True)