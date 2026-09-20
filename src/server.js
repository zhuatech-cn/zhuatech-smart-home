/**
 * 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmartHomeService, createDemoService } from './domain.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(process.env.SMARTHOME_DATA_FILE || './data/smart-home.json');
const apiKey = process.env.SMARTHOME_API_KEY || 'zhuatech-demo-key';
const port = Number(process.env.PORT || 18104);
const service = (() => { try { return new SmartHomeService(JSON.parse(fs.readFileSync(dataFile, 'utf8'))); } catch { return createDemoService(); } })();
const persist = () => { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.writeFileSync(dataFile, JSON.stringify(service.dump(), null, 2)); };
persist();

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};
const bodyOf = async (req) => {
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((n, item) => n + item.length, 0) > 1024 * 1024) throw new Error('请求体超过1MB'); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};
const staticFiles = {
  '/': ['app.html', 'text/html; charset=utf-8'], '/app': ['app.html', 'text/html; charset=utf-8'],
  '/console': ['console.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (staticFiles[url.pathname]) { const [name, type] = staticFiles[url.pathname]; return send(res, 200, fs.readFileSync(path.join(dirname, '..', 'public', name), 'utf8'), type); }
    if (url.pathname === '/health') return send(res, 200, { status: 'UP', service: 'zhuatech-smart-home' });
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
    if (req.headers['x-api-key'] !== apiKey && req.headers['x-device-token'] === undefined) return send(res, 401, { error: 'UNAUTHORIZED' });
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await bodyOf(req) : {};
    const actor = req.headers['x-actor'] || body.actorMemberId || 'api-user';
    let result;
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      const firstHome = [...service.homes.values()][0];
      if (!firstHome) throw new Error('尚未创建家庭');
      result = service.dashboard(firstHome.id);
    }
    else if (req.method === 'POST' && url.pathname === '/api/homes') result = service.createHome(body, actor);
    else if (req.method === 'POST' && url.pathname === '/api/devices') result = service.pairDevice(body, actor);
    else if (req.method === 'POST' && url.pathname === '/api/scenes') result = service.createScene(body, body.actorMemberId);
    else if (req.method === 'POST' && url.pathname === '/api/automations') result = service.createAutomation(body, body.actorMemberId);
    else {
      const dashboard = url.pathname.match(/^\/api\/homes\/([^/]+)\/dashboard$/);
      const member = url.pathname.match(/^\/api\/homes\/([^/]+)\/members$/);
      const room = url.pathname.match(/^\/api\/homes\/([^/]+)\/rooms$/);
      const command = url.pathname.match(/^\/api\/devices\/([^/]+)\/commands$/);
      const event = url.pathname.match(/^\/api\/devices\/([^/]+)\/events$/);
      const scene = url.pathname.match(/^\/api\/scenes\/([^/]+)\/run$/);
      const alarm = url.pathname.match(/^\/api\/alarms\/([^/]+)\/resolve$/);
      if (req.method === 'GET' && dashboard) result = service.dashboard(dashboard[1]);
      else if (req.method === 'POST' && member) result = service.addMember(member[1], body, actor);
      else if (req.method === 'POST' && room) result = service.addRoom(room[1], body, actor);
      else if (req.method === 'POST' && command) result = service.executeCommand(command[1], body, body.actorMemberId);
      else if (req.method === 'POST' && event) result = service.ingestEvent(event[1], body);
      else if (req.method === 'POST' && scene) result = service.runScene(scene[1], body.actorMemberId, body.source || 'app');
      else if (req.method === 'POST' && alarm) result = service.resolveAlarm(alarm[1], body.resolution, body.actorMemberId);
      else return send(res, 404, { error: 'NOT_FOUND' });
    }
    if (req.method !== 'GET') persist();
    return send(res, req.method === 'POST' ? 201 : 200, result);
  } catch (error) {
    return send(res, 400, { error: 'BUSINESS_ERROR', message: error.message });
  }
});

server.listen(port, () => console.log(`ZhuaTech Smart Home running at http://127.0.0.1:${port}`));
