# API 摘要

管理和家庭接口使用 `x-api-key`，设备事件入口可以增加独立的 `x-device-token` 验证。

- `GET /api/dashboard`：首个演示家庭的管理视图；
- `POST /api/homes`：创建家庭与拥有者；
- `POST /api/homes/{id}/members`：添加成员；
- `POST /api/homes/{id}/rooms`：添加房间；
- `POST /api/devices`：设备配网；
- `POST /api/devices/{id}/commands`：执行能力命令；
- `POST /api/devices/{id}/events`：上报传感器事件；
- `POST /api/scenes`：创建多设备场景；
- `POST /api/scenes/{id}/run`：执行场景；
- `POST /api/automations`：创建自动化；
- `POST /api/alarms/{id}/resolve`：处置告警；
- `GET /api/homes/{id}/dashboard`：指定家庭状态。

涉及用户操作时必须提供 `actorMemberId`，领域层会再次校验家庭归属和角色。
