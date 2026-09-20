import test from 'node:test';
import assert from 'node:assert/strict';
import { SmartHomeService } from '../src/domain.js';

function fixture() {
  const service = new SmartHomeService();
  const home = service.createHome({ name: '家', address: '上海', ownerName: '管理员', ownerMobile: '13800000000' });
  const owner = service.members.get(home.ownerId);
  const room = service.addRoom(home.id, { name: '客厅' });
  const light = service.pairDevice({ homeId: home.id, roomId: room.id, serialNo: 'L1', name: '主灯', capabilities: ['power', 'brightness'], initialState: { power: false, brightness: 20 } });
  const sensor = service.pairDevice({ homeId: home.id, roomId: room.id, serialNo: 'S1', name: '传感器', category: 'sensor', capabilities: ['temperature', 'smoke'] });
  return { service, home, owner, room, light, sensor };
}

test('成员权限与设备能力均被校验', () => {
  const { service, home, owner, light } = fixture();
  const guest = service.addMember(home.id, { name: '访客', mobile: '13900000000', role: 'guest' });
  assert.throws(() => service.executeCommand(light.id, { capability: 'power', value: true }, guest.id), /无权/);
  service.executeCommand(light.id, { capability: 'power', value: true }, owner.id);
  assert.equal(service.devices.get(light.id).state.power, true);
  assert.throws(() => service.executeCommand(light.id, { capability: 'temperature', value: 22 }, owner.id), /不支持/);
});

test('场景原子执行多个设备动作', () => {
  const { service, home, owner, light } = fixture();
  const scene = service.createScene({ homeId: home.id, name: '明亮模式', actions: [{ deviceId: light.id, capability: 'power', value: true }, { deviceId: light.id, capability: 'brightness', value: 90 }] }, owner.id);
  const result = service.runScene(scene.id, owner.id);
  assert.equal(result.commands.length, 2);
  assert.equal(service.devices.get(light.id).state.brightness, 90);
});

test('传感器事件触发自动化且事件去重', () => {
  const { service, home, owner, light, sensor } = fixture();
  const scene = service.createScene({ homeId: home.id, name: '高温亮灯', actions: [{ deviceId: light.id, capability: 'power', value: true }] }, owner.id);
  service.createAutomation({ homeId: home.id, name: '高温联动', trigger: { deviceId: sensor.id, capability: 'temperature', operator: 'gt', value: 28 }, sceneId: scene.id }, owner.id);
  assert.equal(service.ingestEvent(sensor.id, { eventId: 'EV1', capability: 'temperature', value: 29 }).triggered.length, 1);
  assert.equal(service.ingestEvent(sensor.id, { eventId: 'EV1', capability: 'temperature', value: 29 }).duplicate, true);
});

test('烟雾事件形成告警并可闭环', () => {
  const { service, owner, sensor } = fixture();
  service.ingestEvent(sensor.id, { eventId: 'EV2', capability: 'smoke', value: true });
  const alarm = [...service.alarms.values()][0];
  assert.equal(alarm.severity, 'critical');
  assert.equal(service.resolveAlarm(alarm.id, '现场确认误报', owner.id).status, 'resolved');
});
