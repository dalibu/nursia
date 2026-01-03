from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


class SystemSettingBase(BaseModel):
    key: str
    value: str
    value_type: Literal["string", "boolean", "number"] = "string"
    description: Optional[str] = None


class SystemSettingCreate(SystemSettingBase):
    pass


class SystemSettingUpdate(BaseModel):
    value: str
    description: Optional[str] = None


class SystemSetting(SystemSettingBase):
    model_config = ConfigDict(from_attributes=True)