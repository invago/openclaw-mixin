/**
 * 用户认证与权限管理系统
 * 管理 Mixin 用户的认证状态和权限级别
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class AuthManager {
  constructor(options = {}) {
    // 数据存储路径
    this.dataDir = options.dataDir || path.join(os.homedir(), '.openclaw', 'data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.pendingAuthFile = path.join(this.dataDir, 'pending-auth.json');

    // 确保目录存在
    this.ensureDataDir();

    // 加载数据
    this.users = {};
    this.pendingAuth = {};
    this.loadUsersSync();
    this.loadPendingAuthSync();

    // 配置
    this.config = {
      // 管理员用户 ID 列表（从环境变量读取）
      adminUserIds: options.adminUserIds || this.parseAdminIds(),

      // 是否启用自动认证（开发环境可用）
      autoApprove: options.autoApprove || process.env.OPENCLAW_AUTO_APPROVE === 'true',

      // 配对码有效期（分钟）
      pairingCodeExpiry: options.pairingCodeExpiry || 10,

      // 最大重试次数
      maxAuthAttempts: options.maxAuthAttempts || 5,

      // 会话有效期（小时）
      sessionExpiryHours: options.sessionExpiryHours || 24,

      ...options,
    };

    // 内存中的会话缓存
    this.sessions = new Map();

    // 异步写入锁
    this.usersLock = false;
    this.pendingAuthLock = false;
    this.pendingWrites = [];
    this.pendingAuthWrites = [];
  }

  /**
   * 确保数据目录存在
   */
  ensureDataDir() {
    if (!fsSync.existsSync(this.dataDir)) {
      fsSync.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * 解析管理员 ID 列表
   */
  parseAdminIds() {
    const envAdmins = process.env.OPENCLAW_ADMIN_USER_IDS || '';
    return envAdmins.split(',').map(id => id.trim()).filter(id => id);
  }

  /**
   * 同步加载用户数据（初始化时使用）
   */
  loadUsersSync() {
    try {
      if (fsSync.existsSync(this.usersFile)) {
        const data = fsSync.readFileSync(this.usersFile, 'utf-8');
        this.users = JSON.parse(data);
      }
    } catch (error) {
      console.error('[Auth] 加载用户数据失败:', error.message);
    }
    return {};
  }

  /**
   * 同步加载待认证数据（初始化时使用）
   */
  loadPendingAuthSync() {
    try {
      if (fsSync.existsSync(this.pendingAuthFile)) {
        const data = fsSync.readFileSync(this.pendingAuthFile, 'utf-8');
        this.pendingAuth = JSON.parse(data);
      }
    } catch (error) {
      console.error('[Auth] 加载待认证数据失败:', error.message);
    }
    return {};
  }

  /**
   * 异步加载用户数据
   */
  async loadUsers() {
    try {
      if (fsSync.existsSync(this.usersFile)) {
        const data = await fs.readFile(this.usersFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[Auth] 加载用户数据失败:', error.message);
    }
    return {};
  }

  /**
   * 保存用户数据（带锁机制）
   */
  async saveUsers() {
    if (this.usersLock) {
      // 等待当前写入完成
      return new Promise(resolve => this.pendingWrites.push(resolve));
    }

    this.usersLock = true;
    try {
      await fs.writeFile(this.usersFile, JSON.stringify(this.users, null, 2), { mode: 0o600 });
      return true;
    } catch (error) {
      console.error('[Auth] 保存用户数据失败:', error.message);
      return false;
    } finally {
      this.usersLock = false;
      const pending = this.pendingWrites.splice(0);
      pending.forEach(cb => cb());
    }
  }

  /**
   * 保存待认证数据（带锁机制）
   */
  async savePendingAuth() {
    if (this.pendingAuthLock) {
      // 等待当前写入完成
      return new Promise(resolve => this.pendingAuthWrites.push(resolve));
    }

    this.pendingAuthLock = true;
    try {
      await fs.writeFile(this.pendingAuthFile, JSON.stringify(this.pendingAuth, null, 2), { mode: 0o600 });
      return true;
    } catch (error) {
      console.error('[Auth] 保存待认证数据失败:', error.message);
      return false;
    } finally {
      this.pendingAuthLock = false;
      const pending = this.pendingAuthWrites.splice(0);
      pending.forEach(cb => cb());
    }
  }

  /**
   * 生成配对码
   */
  async generatePairingCode(userId) {
    // 生成 6 位数字配对码（使用加密安全的随机数）
    const code = crypto.randomInt(100000, 1000000).toString();

    // 存储配对信息
    this.pendingAuth[userId] = {
      code,
      userId,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    };

    await this.savePendingAuth();

    console.log(`[Auth] 为用户 ${userId} 生成配对码：${code}`);

    return code;
  }

  /**
   * 验证配对码
   */
  async verifyPairingCode(userId, code) {
    const pending = this.pendingAuth[userId];

    if (!pending) {
      return { success: false, reason: 'no_pending_auth' };
    }

    // 检查是否过期
    const expiryMs = this.config.pairingCodeExpiry * 60 * 1000;
    if (Date.now() - pending.createdAt > expiryMs) {
      delete this.pendingAuth[userId];
      await this.savePendingAuth();
      return { success: false, reason: 'expired' };
    }

    // 检查尝试次数
    if (pending.attempts >= this.config.maxAuthAttempts) {
      delete this.pendingAuth[userId];
      await this.savePendingAuth();
      return { success: false, reason: 'too_many_attempts' };
    }

    // 验证配对码
    if (pending.code !== code) {
      pending.attempts++;
      await this.savePendingAuth();
      return { success: false, reason: 'invalid_code', remainingAttempts: this.config.maxAuthAttempts - pending.attempts };
    }

    // 配对成功
    delete this.pendingAuth[userId];
    await this.savePendingAuth();

    // 创建用户记录
    this.users[userId] = {
      userId,
      authenticatedAt: Date.now(),
      role: this.isAdmin(userId) ? 'admin' : 'user',
      status: 'active',
    };

    await this.saveUsers();

    // 创建会话
    const session = this.createSession(userId);

    console.log(`[Auth] 用户 ${userId} 认证成功，角色：${this.users[userId].role}`);

    return { success: true, session, role: this.users[userId].role };
  }

  /**
   * 创建会话
   */
  createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (this.config.sessionExpiryHours * 60 * 60 * 1000);

    const session = {
      sessionId,
      userId,
      createdAt: Date.now(),
      expiresAt,
    };

    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * 验证会话
   */
  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { valid: false, reason: 'not_found' };
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return { valid: false, reason: 'expired' };
    }

    const user = this.users[session.userId];
    if (!user || user.status !== 'active') {
      return { valid: false, reason: 'user_inactive' };
    }

    return { valid: true, userId: session.userId, role: user.role };
  }

  /**
   * 检查用户是否已认证
   */
  isAuthenticated(userId) {
    const user = this.users[userId];
    return user && user.status === 'active';
  }

  /**
   * 检查是否有待认证
   */
  hasPendingAuth(userId) {
    const pending = this.pendingAuth[userId];
    if (!pending) return false;

    // 检查是否过期
    const expiryMs = this.config.pairingCodeExpiry * 60 * 1000;
    if (Date.now() - pending.createdAt > expiryMs) {
      delete this.pendingAuth[userId];
      return false;
    }

    return true;
  }

  /**
   * 检查用户是否为管理员
   */
  isAdmin(userId) {
    // 检查是否在配置的管理员列表中
    if (this.config.adminUserIds.includes(userId)) {
      return true;
    }

    // 检查用户记录中的角色
    const user = this.users[userId];
    return user && user.role === 'admin';
  }

  /**
   * 获取用户角色
   */
  getUserRole(userId) {
    if (this.isAdmin(userId)) return 'admin';
    if (this.isAuthenticated(userId)) return 'user';
    return 'guest';
  }

  /**
   * 检查权限
   */
  hasPermission(userId, permission) {
    const role = this.getUserRole(userId);

    const permissions = {
      guest: ['chat'],
      user: ['chat', 'history', 'settings'],
      admin: ['chat', 'history', 'settings', 'admin', 'broadcast', 'manage_users'],
    };

    return permissions[role]?.includes(permission) || false;
  }

  /**
   * 添加管理员
   */
  async addAdmin(userId, addedBy) {
    if (!this.isAdmin(addedBy)) {
      return { success: false, reason: 'unauthorized' };
    }

    // 添加到配置文件
    this.config.adminUserIds.push(userId);

    // 更新用户记录
    if (this.users[userId]) {
      this.users[userId].role = 'admin';
      this.users[userId].promotedBy = addedBy;
      this.users[userId].promotedAt = Date.now();
    } else {
      this.users[userId] = {
        userId,
        role: 'admin',
        promotedBy: addedBy,
        promotedAt: Date.now(),
        status: 'active',
      };
    }

    await this.saveUsers();

    console.log(`[Auth] 用户 ${userId} 被提升为管理员（操作者：${addedBy}）`);

    return { success: true };
  }

  /**
   * 移除管理员权限
   */
  async removeAdmin(userId, removedBy) {
    if (!this.isAdmin(removedBy)) {
      return { success: false, reason: 'unauthorized' };
    }

    if (userId === removedBy) {
      return { success: false, reason: 'cannot_remove_self' };
    }

    // 从配置中移除
    this.config.adminUserIds = this.config.adminUserIds.filter(id => id !== userId);

    // 更新用户记录
    if (this.users[userId]) {
      this.users[userId].role = 'user';
      this.users[userId].demotedBy = removedBy;
      this.users[userId].demotedAt = Date.now();
      await this.saveUsers();
    }

    console.log(`[Auth] 用户 ${userId} 的管理员权限已被移除（操作者：${removedBy}）`);

    return { success: true };
  }

  /**
   * 禁用用户
   */
  async disableUser(userId, disabledBy) {
    if (!this.isAdmin(disabledBy)) {
      return { success: false, reason: 'unauthorized' };
    }

    if (this.isAdmin(userId)) {
      return { success: false, reason: 'cannot_disable_admin' };
    }

    if (this.users[userId]) {
      this.users[userId].status = 'disabled';
      this.users[userId].disabledBy = disabledBy;
      this.users[userId].disabledAt = Date.now();
      await this.saveUsers();

      // 清除该用户的所有会话
      for (const [sessionId, session] of this.sessions) {
        if (session.userId === userId) {
          this.sessions.delete(sessionId);
        }
      }

      console.log(`[Auth] 用户 ${userId} 已被禁用（操作者：${disabledBy}）`);
      return { success: true };
    }

    return { success: false, reason: 'user_not_found' };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalUsers: Object.keys(this.users).length,
      activeUsers: Object.values(this.users).filter(u => u.status === 'active').length,
      adminCount: Object.values(this.users).filter(u => u.role === 'admin').length,
      pendingAuth: Object.keys(this.pendingAuth).length,
      activeSessions: this.sessions.size,
    };
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // 清理过期待认证
    for (const [userId, pending] of Object.entries(this.pendingAuth)) {
      const expiryMs = this.config.pairingCodeExpiry * 60 * 1000;
      if (now - pending.createdAt > expiryMs) {
        delete this.pendingAuth[userId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.savePendingAuth();
      console.log(`[Auth] 清理了 ${cleaned} 个过期的认证请求`);
    }

    // 清理过期会话
    let sessionsCleaned = 0;
    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        sessionsCleaned++;
      }
    }

    if (sessionsCleaned > 0) {
      console.log(`[Auth] 清理了 ${sessionsCleaned} 个过期会话`);
    }

    return { pendingCleaned: cleaned, sessionsCleaned };
  }
}

// 单例实例
let defaultAuthManager = null;

function getAuthManager(options = {}) {
  if (!defaultAuthManager) {
    defaultAuthManager = new AuthManager(options);
  }
  return defaultAuthManager;
}

module.exports = {
  AuthManager,
  getAuthManager,
};
