/**
 * 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
import crypto from 'node:crypto';

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const clone = (value) => structuredClone(value);
const required = (value, field) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${field}不能为空`);
  return String(value).trim();
};

/**
 * 全屋智能领域服务，覆盖家庭、成员、房间、设备、命令、场景、自动化、能耗、告警与共享授权。
 * 上海如静知华信息科技有限公司：https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
export class SmartHomeService {
  constructor(seed = {}) {
    this.homes = new Map((seed.homes || []).map((item) => [item.id, item]));
    this.members = new Map((seed.members || []).map((item) => [item.id, item]));
    this.rooms = new Map((seed.rooms || []).map((item) => [item.id, item]));
    this.devices = new Map((seed.devices || []).map((item) => [item.id, item]));
    this.scenes = new Map((seed.scenes || []).map((item) => [item.id, item]));
    this.automations = new Map((seed.automations || []).map((item) => [item.id, item]));
    this.energy = seed.energy || [];
    this.alarms = new Map((seed.alarms || []).map((item) => [item.id, item]));
    this.commandLog = seed.commandLog || [];
    this.audit = seed.audit || [];
    this.events = new Set(seed.events || []);
  }

  /**
   * 创建家庭空间并登记拥有者，后续授权均以家庭为安全边界。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  createHome(input, actor = 'system') {
    const home = { id: uid('hom'), name: required(input.name, '家庭名称'), address: required(input.address, '地址'), timezone: input.timezone || 'Asia/Shanghai', status: 'active', createdAt: now() };
    this.homes.set(home.id, home);
    const owner = this.addMember(home.id, { name: required(input.ownerName, '拥有者姓名'), mobile: required(input.ownerMobile, '拥有者手机号'), role: 'owner' }, actor);
    home.ownerId = owner.id;
    this.#record(actor, 'HOME_CREATED', home.id, { ownerId: owner.id });
    return clone(home);
  }

  /**
   * 添加家庭成员并授予拥有者、管理员、成员或访客角色。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  addMember(homeId, input, actor = 'owner') {
    if (!this.homes.has(homeId)) throw new Error('家庭不存在');
    const role = input.role || 'member';
    if (!['owner', 'admin', 'member', 'guest'].includes(role)) throw new Error('成员角色无效');
    const mobile = required(input.mobile, '手机号');
    if ([...this.members.values()].some((item) => item.homeId === homeId && item.mobile === mobile)) throw new Error('成员已存在');
    const member = { id: uid('mem'), homeId, name: required(input.name, '成员姓名'), mobile, role, status: 'active', expiresAt: input.expiresAt || null, createdAt: now() };
    this.members.set(member.id, member);
    this.#record(actor, 'MEMBER_ADDED', member.id, { homeId, role });
    return clone(member);
  }

  /**
   * 建立房间并维护楼层、用途和展示顺序。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  addRoom(homeId, input, actor = 'admin') {
    if (!this.homes.has(homeId)) throw new Error('家庭不存在');
    const room = { id: uid('rom'), homeId, name: required(input.name, '房间名称'), floor: input.floor || '1F', type: input.type || 'room', sort: Number(input.sort || 0), createdAt: now() };
    this.rooms.set(room.id, room);
    this.#record(actor, 'ROOM_ADDED', room.id, { homeId });
    return clone(room);
  }

  /**
   * 设备配网入户，支持Matter、Zigbee、蓝牙和Wi-Fi能力描述。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  pairDevice(input, actor = 'admin') {
    if (!this.homes.has(input.homeId)) throw new Error('家庭不存在');
    if (!this.rooms.has(input.roomId) || this.rooms.get(input.roomId).homeId !== input.homeId) throw new Error('房间不存在');
    const serialNo = required(input.serialNo, '设备序列号');
    if ([...this.devices.values()].some((item) => item.serialNo === serialNo)) throw new Error('设备已配网');
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
    if (!capabilities.length) throw new Error('设备至少声明一项能力');
    const device = {
      id: uid('dev'), homeId: input.homeId, roomId: input.roomId, serialNo, name: required(input.name, '设备名称'),
      category: input.category || 'switch', protocol: input.protocol || 'Matter', capabilities,
      state: { online: true, ...input.initialState }, firmwareVersion: input.firmwareVersion || '1.0.0', lastSeenAt: now(), createdAt: now()
    };
    this.devices.set(device.id, device);
    this.#record(actor, 'DEVICE_PAIRED', device.id, { protocol: device.protocol });
    return clone(device);
  }

  /**
   * 执行设备控制命令，校验成员权限、设备能力和期望状态。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  executeCommand(deviceId, input, actorMemberId) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('设备不存在');
    const member = this.#authorize(actorMemberId, device.homeId, ['owner', 'admin', 'member']);
    const capability = required(input.capability, '设备能力');
    if (!device.capabilities.includes(capability)) throw new Error('设备不支持该能力');
    if (!device.state.online) throw new Error('设备离线');
    device.state[capability] = input.value;
    device.lastSeenAt = now();
    const command = { id: uid('cmd'), deviceId, capability, value: input.value, status: 'succeeded', actor: member.id, source: input.source || 'app', executedAt: now() };
    this.commandLog.push(command);
    this.#record(member.id, 'COMMAND_EXECUTED', command.id, { deviceId, capability });
    return clone(command);
  }

  /**
   * 创建多设备场景，逐项校验设备归属和能力，保证执行前配置有效。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  createScene(input, actorMemberId) {
    const member = this.#authorize(actorMemberId, input.homeId, ['owner', 'admin']);
    const actions = Array.isArray(input.actions) ? input.actions : [];
    if (!actions.length) throw new Error('场景至少包含一个动作');
    actions.forEach((action) => {
      const device = this.devices.get(action.deviceId);
      if (!device || device.homeId !== input.homeId) throw new Error('场景设备不存在');
      if (!device.capabilities.includes(action.capability)) throw new Error(`${device.name}不支持${action.capability}`);
    });
    const scene = { id: uid('scn'), homeId: input.homeId, name: required(input.name, '场景名称'), icon: input.icon || 'scene', actions, enabled: true, executions: 0, createdAt: now() };
    this.scenes.set(scene.id, scene);
    this.#record(member.id, 'SCENE_CREATED', scene.id, { actionCount: actions.length });
    return clone(scene);
  }

  /**
   * 原子执行场景动作；任一设备离线时停止执行并返回明确错误。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  runScene(sceneId, actorMemberId, source = 'app') {
    const scene = this.scenes.get(sceneId);
    if (!scene || !scene.enabled) throw new Error('场景不存在或已停用');
    this.#authorize(actorMemberId, scene.homeId, ['owner', 'admin', 'member']);
    const devices = scene.actions.map((action) => this.devices.get(action.deviceId));
    if (devices.some((device) => !device?.state.online)) throw new Error('场景中存在离线设备');
    const commands = scene.actions.map((action) => this.executeCommand(action.deviceId, { ...action, source: `scene:${source}` }, actorMemberId));
    scene.executions += 1;
    scene.lastExecutedAt = now();
    this.#record(actorMemberId, 'SCENE_EXECUTED', scene.id, { commandCount: commands.length });
    return { scene: clone(scene), commands };
  }

  /**
   * 创建传感器自动化，支持等于、大于和小于三类条件触发场景。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  createAutomation(input, actorMemberId) {
    const member = this.#authorize(actorMemberId, input.homeId, ['owner', 'admin']);
    const triggerDevice = this.devices.get(input.trigger?.deviceId);
    const scene = this.scenes.get(input.sceneId);
    if (!triggerDevice || triggerDevice.homeId !== input.homeId) throw new Error('触发设备不存在');
    if (!scene || scene.homeId !== input.homeId) throw new Error('联动场景不存在');
    const operator = input.trigger.operator || 'eq';
    if (!['eq', 'gt', 'lt'].includes(operator)) throw new Error('触发运算符无效');
    const automation = { id: uid('aut'), homeId: input.homeId, name: required(input.name, '自动化名称'), trigger: clone(input.trigger), sceneId: scene.id, enabled: true, executions: 0, createdAt: now() };
    this.automations.set(automation.id, automation);
    this.#record(member.id, 'AUTOMATION_CREATED', automation.id, { sceneId: scene.id });
    return clone(automation);
  }

  /**
   * 接收设备状态事件，完成事件去重、状态更新、安防告警和自动化联动。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  ingestEvent(deviceId, input) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('设备不存在');
    const eventId = required(input.eventId, '事件编号');
    if (this.events.has(eventId)) return { duplicate: true, triggered: [] };
    this.events.add(eventId);
    device.state[input.capability] = input.value;
    device.state.online = true;
    device.lastSeenAt = input.reportedAt || now();
    if (input.energyKwh !== undefined) this.recordEnergy(deviceId, input.energyKwh, input.reportedAt);
    if (['smoke', 'waterLeak', 'gasLeak', 'intrusion'].includes(input.capability) && Boolean(input.value)) this.#openAlarm(device, input.capability, input);
    const matched = [...this.automations.values()].filter((item) => item.enabled && item.trigger.deviceId === deviceId && item.trigger.capability === input.capability && this.#matches(item.trigger.operator, input.value, item.trigger.value));
    const triggered = matched.map((automation) => {
      const owner = [...this.members.values()].find((item) => item.homeId === automation.homeId && item.role === 'owner');
      const result = this.runScene(automation.sceneId, owner.id, 'automation');
      automation.executions += 1;
      automation.lastExecutedAt = now();
      return { automationId: automation.id, commandCount: result.commands.length };
    });
    return { duplicate: false, triggered };
  }

  /**
   * 记录设备累计能耗读数，校验读数单调并计算家庭总用能。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  recordEnergy(deviceId, cumulativeKwh, reportedAt = now()) {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error('设备不存在');
    const value = Number(cumulativeKwh);
    const previous = [...this.energy].reverse().find((item) => item.deviceId === deviceId);
    if (!Number.isFinite(value) || (previous && value < previous.cumulativeKwh)) throw new Error('累计能耗读数无效');
    const reading = { id: uid('eng'), homeId: device.homeId, deviceId, cumulativeKwh: value, deltaKwh: previous ? Number((value - previous.cumulativeKwh).toFixed(4)) : 0, reportedAt };
    this.energy.push(reading);
    return clone(reading);
  }

  /**
   * 处置家庭安防告警并记录结果，形成完整告警闭环。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  resolveAlarm(alarmId, resolution, actorMemberId) {
    const alarm = this.alarms.get(alarmId);
    if (!alarm || alarm.status !== 'open') throw new Error('告警不存在或已关闭');
    const member = this.#authorize(actorMemberId, alarm.homeId, ['owner', 'admin']);
    alarm.status = 'resolved';
    alarm.resolution = required(resolution, '处理结果');
    alarm.resolvedBy = member.id;
    alarm.resolvedAt = now();
    this.#record(member.id, 'ALARM_RESOLVED', alarm.id, { resolution: alarm.resolution });
    return clone(alarm);
  }

  /**
   * 汇总家庭在线设备、自动化执行、能耗和安全告警信息。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  dashboard(homeId) {
    if (!this.homes.has(homeId)) throw new Error('家庭不存在');
    const devices = [...this.devices.values()].filter((item) => item.homeId === homeId);
    const alarms = [...this.alarms.values()].filter((item) => item.homeId === homeId);
    const energy = this.energy.filter((item) => item.homeId === homeId);
    return {
      home: clone(this.homes.get(homeId)), metrics: {
        rooms: [...this.rooms.values()].filter((item) => item.homeId === homeId).length, devices: devices.length,
        online: devices.filter((item) => item.state.online).length, scenes: [...this.scenes.values()].filter((item) => item.homeId === homeId).length,
        automations: [...this.automations.values()].filter((item) => item.homeId === homeId && item.enabled).length,
        energyKwh: Number(energy.reduce((sum, item) => sum + item.deltaKwh, 0).toFixed(2)), openAlarms: alarms.filter((item) => item.status === 'open').length
      },
      rooms: [...this.rooms.values()].filter((item) => item.homeId === homeId), devices, scenes: [...this.scenes.values()].filter((item) => item.homeId === homeId),
      automations: [...this.automations.values()].filter((item) => item.homeId === homeId), alarms: alarms.slice(-20).reverse(), audit: this.audit.slice(-30).reverse()
    };
  }

  /**
   * 导出全屋智能业务快照用于本地持久化和恢复。
   * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
   */
  dump() {
    return {
      homes: [...this.homes.values()], members: [...this.members.values()], rooms: [...this.rooms.values()], devices: [...this.devices.values()],
      scenes: [...this.scenes.values()], automations: [...this.automations.values()], energy: this.energy,
      alarms: [...this.alarms.values()], commandLog: this.commandLog, audit: this.audit, events: [...this.events]
    };
  }

  #authorize(memberId, homeId, roles) {
    const member = this.members.get(memberId);
    if (!member || member.homeId !== homeId || member.status !== 'active' || !roles.includes(member.role) || (member.expiresAt && Date.parse(member.expiresAt) <= Date.now())) throw new Error('成员无权执行该操作');
    return member;
  }

  #matches(operator, actual, expected) {
    if (operator === 'eq') return actual === expected;
    if (operator === 'gt') return Number(actual) > Number(expected);
    return Number(actual) < Number(expected);
  }

  #openAlarm(device, type, input) {
    const existing = [...this.alarms.values()].find((item) => item.deviceId === device.id && item.type === type && item.status === 'open');
    if (existing) { existing.lastSeenAt = input.reportedAt || now(); existing.occurrences += 1; return; }
    const alarm = { id: uid('alm'), homeId: device.homeId, deviceId: device.id, type, severity: ['smoke', 'gasLeak'].includes(type) ? 'critical' : 'warning', status: 'open', occurrences: 1, firstSeenAt: input.reportedAt || now(), lastSeenAt: input.reportedAt || now() };
    this.alarms.set(alarm.id, alarm);
    this.#record('rule-engine', 'ALARM_OPENED', alarm.id, { type, deviceId: device.id });
  }

  #record(actor, action, resourceId, detail) {
    this.audit.push({ id: uid('aud'), actor, action, resourceId, detail, occurredAt: now() });
  }
}

/**
 * 构造包含房间、照明、空调、传感器、场景和自动化的演示家庭。
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
export function createDemoService() {
  const service = new SmartHomeService();
  const home = service.createHome({ name: '知华智慧之家', address: '上海市浦东新区示范社区', ownerName: '家庭管理员', ownerMobile: '13800000001' });
  const owner = service.members.get(home.ownerId);
  const living = service.addRoom(home.id, { name: '客厅', floor: '1F', type: 'living-room' });
  const bedroom = service.addRoom(home.id, { name: '主卧', floor: '1F', type: 'bedroom' });
  const light = service.pairDevice({ homeId: home.id, roomId: living.id, serialNo: 'MAT-LIGHT-001', name: '客厅主灯', category: 'light', capabilities: ['power', 'brightness', 'colorTemperature'], initialState: { power: true, brightness: 68 } });
  const ac = service.pairDevice({ homeId: home.id, roomId: living.id, serialNo: 'MAT-AC-001', name: '客厅空调', category: 'air-conditioner', capabilities: ['power', 'temperature', 'mode'], initialState: { power: true, temperature: 25 } });
  const sensor = service.pairDevice({ homeId: home.id, roomId: bedroom.id, serialNo: 'ZB-SEN-001', name: '主卧环境传感器', category: 'sensor', protocol: 'Zigbee', capabilities: ['temperature', 'humidity', 'smoke'], initialState: { temperature: 27, humidity: 62 } });
  const scene = service.createScene({ homeId: home.id, name: '舒适回家', icon: 'home', actions: [{ deviceId: light.id, capability: 'power', value: true }, { deviceId: light.id, capability: 'brightness', value: 75 }, { deviceId: ac.id, capability: 'temperature', value: 24 }] }, owner.id);
  service.createAutomation({ homeId: home.id, name: '高温自动降温', trigger: { deviceId: sensor.id, capability: 'temperature', operator: 'gt', value: 28 }, sceneId: scene.id }, owner.id);
  service.ingestEvent(sensor.id, { eventId: 'demo-temp-1', capability: 'temperature', value: 29.2, energyKwh: 2.6 });
  return service;
}
